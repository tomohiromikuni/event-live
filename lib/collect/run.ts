import 'server-only';
import { q, one } from '../db';
import { todayJST } from '../dates';
import { PREFECTURES } from '../prefectures';
import { fetchFeed, fetchPage } from './web';
import { extractEvents, extractorReady, type Extracted } from './extract';
import { confidence, datesOverlap, fingerprint, similarity } from './dedupe';
import { settleAutoPublish, tryAutoPublish } from './publish';

/**
 * 自動収集の1回分。Vercel の実行時間に収まるよう、1回で扱う件数を絞り、残りは次回へ回す。
 * 1) 巡回の時期が来た情報源を取得（RSS は記事一覧 → 記事ページ、page はそのページ）
 * 2) 内容が前回から変わったページだけ「抽出待ち」にする
 * 3) 抽出待ちのページを AI で整理 → 重複チェック → 候補（確認待ち）として保存
 */
const FETCH_LIMIT = 12;     // 1回で取得するページ数の上限
const EXTRACT_LIMIT = 6;    // 1回でAIに送るページ数の上限
const MAX_ATTEMPTS = 3;     // 失敗したページの再試行回数

type Source = { id: number; name: string; kind: string; url: string; prefecture: string; trust: string; interval_hours: number; last_fetched_at: number };

export async function getSetting(key: string, def = '') {
  return (await one<{ value: string }>('SELECT value FROM app_settings WHERE key = $1', [key]))?.value ?? def;
}
export async function setSetting(key: string, value: string) {
  await q('INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value]);
}

export async function runCollect(trigger: 'cron' | 'manual') {
  const started = Date.now();
  const stats = { fetched: 0, changed: 0, extracted: 0, new_candidates: 0, duplicates: 0, published: 0, created: 0, errors: 0, input_tokens: 0, output_tokens: 0 };
  const log: string[] = [];
  const [{ id: runId }] = await q<{ id: number }>('INSERT INTO crawl_runs (trigger, started_at) VALUES ($1, $2) RETURNING id', [trigger, started]);

  // ---- 1) 取得 ----
  const due = await q<Source>(`SELECT * FROM sources WHERE enabled = 1 AND terms_checked_at <> ''
    AND last_fetched_at < $1::bigint - interval_hours::bigint * 3600000 ORDER BY last_fetched_at LIMIT 10`, [started]);
  if (due.length === 0) log.push('巡回の時期が来た情報源はありません（情報源が未登録・停止中、または前回の取得から間隔が経っていない）');
  let budget = FETCH_LIMIT;
  for (const s of due) {
    if (budget <= 0) break;
    try {
      const urls: string[] = [];
      if (s.kind === 'rss') {
        const items = await fetchFeed(s.url);
        if (items === null) { await markSource(s.id, 'robots.txt で取得が禁止されています'); continue; }
        // まだ取得していない記事、または一定期間たった記事だけ
        for (const it of items) {
          const known = await one<{ fetched_at: number }>('SELECT fetched_at FROM crawl_pages WHERE url = $1', [it.link]);
          if (!known || known.fetched_at < started - s.interval_hours * 3600_000) urls.push(it.link);
        }
      } else {
        urls.push(s.url);
      }
      for (const url of urls.slice(0, budget)) {
        budget--;
        try {
          const page = await fetchPage(url);
          if (!page) { log.push(`robots.txt により除外: ${url}`); continue; }
          stats.fetched++;
          const prev = await one<{ id: number; text_hash: string }>('SELECT id, text_hash FROM crawl_pages WHERE url = $1', [url]);
          if (prev && prev.text_hash === page.hash) {
            await q('UPDATE crawl_pages SET fetched_at = $1 WHERE id = $2', [started, prev.id]);
            continue; // 内容が変わっていない → AIに送らない（費用削減）
          }
          stats.changed++;
          await q(`INSERT INTO crawl_pages (source_id, url, title, text_hash, text, links, status, attempts, error, fetched_at)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0, '', $7)
            ON CONFLICT (url) DO UPDATE SET title = $3, text_hash = $4, text = $5, links = $6, status = 'pending', attempts = 0, error = '', fetched_at = $7`,
            [s.id, url, page.title.slice(0, 200), page.hash, page.text, JSON.stringify(page.links), started]);
        } catch (e) {
          stats.errors++; log.push(`取得エラー ${url}: ${msg(e)}`);
        }
      }
      await markSource(s.id, 'ok');
    } catch (e) {
      stats.errors++; log.push(`情報源エラー「${s.name}」: ${msg(e)}`);
      await markSource(s.id, `エラー: ${msg(e)}`);
    }
  }

  // ---- 2) AIで整理 → 候補 ----
  if (!extractorReady()) {
    log.push('ANTHROPIC_API_KEY が未設定のため、AIでの整理は行っていません（取得したページは抽出待ちのまま残ります）');
  } else {
    const pages = await q<{ id: number; source_id: number; url: string; title: string; text: string; links: string; attempts: number }>(
      `SELECT id, source_id, url, title, text, links, attempts FROM crawl_pages WHERE status = 'pending' AND attempts < $1 ORDER BY fetched_at LIMIT $2`,
      [MAX_ATTEMPTS, EXTRACT_LIMIT]);
    const today = todayJST();
    for (const p of pages) {
      try {
        const { events, usage } = await extractEvents(p, today);
        stats.extracted++; stats.input_tokens += usage.input; stats.output_tokens += usage.output;
        const src = await one<{ trust: string; prefecture: string }>('SELECT trust, prefecture FROM sources WHERE id = $1', [p.source_id]);
        for (const raw of events) {
          const e = clean(raw, src?.prefecture ?? '');
          if (!e) continue;
          if (e.end_date && e.end_date < today) continue; // すでに終わったイベントは候補にしない
          const r = await saveCandidate(e, { pageId: p.id, sourceId: p.source_id, url: p.url, trust: src?.trust ?? 'other', mapLinks: JSON.parse(p.links || '[]') });
          if (r.kind === 'new') stats.new_candidates++; else if (r.kind === 'duplicate') stats.duplicates++;
          // 承認を待たずに公開（条件を満たすものだけ。会場マップは定期実行で自動作成）
          if (r.id) {
            const pub = await tryAutoPublish(r.id, r.kind === 'duplicate').catch((err) => String(err));
            if (pub === 'published') {
              const ev = await one<{ event_id: number }>('SELECT event_id FROM event_candidates WHERE id = $1', [r.id]);
              if (ev && (await settleAutoPublish(ev.event_id)) === 'published') stats.published++;
              else stats.created++;
            }
          }
        }
        await q("UPDATE crawl_pages SET status = 'done', extracted_at = $1, error = '' WHERE id = $2", [Date.now(), p.id]);
      } catch (e) {
        stats.errors++; log.push(`AI整理エラー ${p.url}: ${msg(e)}`);
        await q("UPDATE crawl_pages SET attempts = attempts + 1, error = $1, status = CASE WHEN attempts + 1 >= $2 THEN 'failed' ELSE 'pending' END WHERE id = $3",
          [msg(e).slice(0, 300), MAX_ATTEMPTS, p.id]);
      }
    }
  }

  const remaining = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM crawl_pages WHERE status = 'pending' AND attempts < $1`, [MAX_ATTEMPTS]);
  const dueLeft = await one<{ n: number }>(`SELECT COUNT(*)::int AS n FROM sources WHERE enabled = 1 AND terms_checked_at <> '' AND last_fetched_at < $1::bigint - interval_hours::bigint * 3600000`, [Date.now()]);
  await q(`UPDATE crawl_runs SET finished_at = $1, fetched = $2, changed = $3, extracted = $4, new_candidates = $5, duplicates = $6, errors = $7,
    input_tokens = $8, output_tokens = $9, log = $10 WHERE id = $11`,
    [Date.now(), stats.fetched, stats.changed, stats.extracted, stats.new_candidates, stats.duplicates, stats.errors, stats.input_tokens, stats.output_tokens, log.join('\n').slice(0, 8000), runId]);
  // done: まだ処理が残っていなければ true（定期実行はこれが true になるまで数回呼ぶ）
  if (stats.published || stats.created) log.push(`自動公開 ${stats.published}件・地図の自動作成待ち（非公開）${stats.created}件`);
  const done = (dueLeft?.n ?? 0) === 0 && (!extractorReady() || (remaining?.n ?? 0) === 0);
  return { runId, done, ...stats, log };
}

async function markSource(id: number, status: string) {
  await q('UPDATE sources SET last_fetched_at = $1, last_status = $2 WHERE id = $3', [Date.now(), status.slice(0, 300), id]);
}

/** AIの出力を整える（形式がおかしい値は捨てる。推測では埋めない） */
function clean(e: Extracted, sourcePref: string): Extracted | null {
  const s = (v: unknown, max = 500) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const name = s(e.name, 120);
  if (!name) return null;
  const start = date(e.start_date);
  let end = date(e.end_date) ?? start;
  if (start && end && end < start) end = start;
  let pref = s(e.prefecture, 10);
  if (pref && !PREFECTURES.includes(pref)) pref = PREFECTURES.find((p) => p.startsWith(pref!)) ?? null;
  const url = s(e.official_url, 300);
  return {
    ...e, name, start_date: start, end_date: start ? end : null, prefecture: pref ?? (sourcePref || null),
    time_text: s(e.time_text, 100), city: s(e.city, 40), venue_name: s(e.venue_name, 100), address: s(e.address, 200),
    official_hashtag: s(e.official_hashtag, 40),
    summary: s(e.summary, 200), organizer: s(e.organizer, 100), official_url: url && /^https?:\/\//.test(url) ? url : null,
    access: s(e.access), nearest_station: s(e.nearest_station, 100), parking_info: s(e.parking_info), traffic_info: s(e.traffic_info), ticket_info: s(e.ticket_info),
    shuttle_info: s(e.shuttle_info), toilet_info: s(e.toilet_info), food_info: s(e.food_info),
    evidence: { name: s(e.evidence?.name, 200), date: s(e.evidence?.date, 200), place: s(e.evidence?.place, 200) },
  };
}

/** 候補として保存。既存イベント・既存候補と重複していれば印を付ける */
async function saveCandidate(e: Extracted, ctx: { pageId: number; sourceId: number; url: string; trust: string; mapLinks: string[] }) {
  const fp = fingerprint(e);
  const now = Date.now();
  const data = JSON.stringify({ ...e, map_links: ctx.mapLinks });
  // 同じ候補がすでにある（同じページから再抽出・別ページで同じイベント）
  const sameCand = await q<{ id: number; status: string; data: string }>(
    `SELECT id, status, data FROM event_candidates WHERE fingerprint = $1 OR (source_url = $2 AND status = 'pending') ORDER BY id DESC LIMIT 5`, [fp, ctx.url]);
  const twin = sameCand.find((c) => { const d = JSON.parse(c.data) as Extracted; return similarity(d.name, e.name) >= 0.8; });
  if (twin) {
    if (twin.status === 'pending') {
      await q('UPDATE event_candidates SET data = $1, confidence = GREATEST(confidence, $2), updated_at = $3 WHERE id = $4', [data, confidence(e, ctx.trust), now, twin.id]);
    }
    return { kind: 'duplicate' as const, id: 0 };
  }
  // 既存のイベントと同じか（同じ都道府県・日程が重なる・名前が似ている）
  let match: number | null = null;
  if (e.start_date) {
    const evs = await q<{ id: number; name: string; prefecture: string; start_date: string; end_date: string; recurring: number }>(
      `SELECT id, name, prefecture, start_date, end_date, recurring FROM events WHERE ($1 = '' OR prefecture = $1)`, [e.prefecture ?? '']);
    const hit = evs.find((x) => similarity(x.name, e.name) >= 0.7 && (datesOverlap(e.start_date, e.end_date, x.start_date, x.end_date) || x.recurring));
    match = hit?.id ?? null;
  }
  const [{ id }] = await q<{ id: number }>(`INSERT INTO event_candidates (page_id, source_id, source_url, fingerprint, data, confidence, status, match_event_id, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $8) RETURNING id`,
    [ctx.pageId, ctx.sourceId, ctx.url, fp, data, confidence(e, ctx.trust), match, now]);
  return { kind: match ? 'duplicate' as const : 'new' as const, id };
}

function msg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
