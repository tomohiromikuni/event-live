import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { one, q } from '../db';
import { addDays, todayJST } from '../dates';
import { PREFECTURES } from '../prefectures';
import { fetchPage } from './web';
import { collectModel, extractorReady } from './extract';
import { getSetting, setSetting } from './run';

/**
 * 「AIで探す」：情報源を登録しなくても、季節ごとに 都道府県 × テーマ（花火大会・夏祭り など）で
 * AI が Web を検索し、イベントの**公式サイト**（主催者・自治体・観光協会）を見つける。
 * 見つけたページは robots.txt を守って取得し、ふだんの自動収集と同じ流れ（AIで整理 → 候補 → 確認して承認）に乗せる。
 * まとめサイト・ポータル・ブログ・SNS は使わない（他社の掲載情報を使わない／公式の情報だけ）。
 * 費用：1回あたり 検索3回まで（約$0.03）＋ AI（Haiku）の利用料。1日の回数は管理画面で変えられる（初期 3回）。
 */
const MAX_SEARCHES = 3;      // 1回の探索での Web 検索の上限
const MAX_PAGES = 6;         // 1回の探索で取得する公式ページの上限
const RECHECK_DAYS = 30;     // 同じページを取り直すまでの日数

/** 他社の掲載情報（まとめ・ポータル・予約サイト・SNS など）は検索結果から外す */
export const BLOCKED_DOMAINS = [
  'walkerplus.com', 'jalan.net', 'rurubu.jp', 'enjoytokyo.jp', 'iko-yo.net', 'jorudan.co.jp', 'tripadvisor.jp', 'tripadvisor.com',
  'travel.rakuten.co.jp', 'asoview.com', 'gurutabi.gnavi.co.jp', 'navitime.co.jp', 'mapion.co.jp', 'hanabi-navi.com', 'omatsurijapan.com',
  'mapple.net', 'tabiiro.jp', 'retrip.jp', 'linetrip.jp', 'kanko-pro.com', 'eventernote.com', 'peatix.com', 'passmarket.yahoo.co.jp',
  'eplus.jp', 'pia.jp', 'ticket.pia.jp', 'l-tike.com', 'ameblo.jp', 'note.com', 'hatenablog.com', 'fc2.com', 'livedoor.jp', 'goo.ne.jp',
  'x.com', 'twitter.com', 'instagram.com', 'facebook.com', 'tiktok.com', 'youtube.com', 'wikipedia.org', 'yahoo.co.jp', 'google.com',
];

/** 季節（1〜2か月先の月）ごとのテーマ */
export function seasonThemes(month: number): string[] {
  if (month >= 3 && month <= 5) return ['桜まつり', '春祭り'];
  if (month >= 6 && month <= 8) return ['花火大会', '夏祭り'];
  if (month >= 9 && month <= 11) return ['秋祭り', '花火大会'];
  return ['イルミネーション', '冬祭り'];
}

export async function discoverSettings() {
  const prefs = (await getSetting('discover_prefs', '')).split(/[,、\s]+/).filter((p) => PREFECTURES.includes(p));
  return {
    perDay: Math.min(Math.max(Number(await getSetting('discover_per_day', '0')) || 0, 0), 20),
    budgetYen: Math.min(Math.max(Number(await getSetting('discover_budget_yen', '1000')) || 0, 0), 100000),
    prefs: prefs.length ? prefs : PREFECTURES,
  };
}

/** 次に探す「都道府県 × テーマ」と期間（今日から60日先まで） */
export async function nextTarget() {
  const today = todayJST(), to = addDays(today, 60);
  const themes = seasonThemes(Number(addDays(today, 30).slice(5, 7)));
  const { prefs } = await discoverSettings();
  const plan = prefs.flatMap((p) => themes.map((t) => ({ pref: p, theme: t })));
  const cursor = Number(await getSetting('discover_cursor', '0')) || 0;
  return { ...plan[cursor % plan.length], from: today, to, index: cursor % plan.length, total: plan.length, cursor };
}

let client: Anthropic | null = null;

export async function ensureSource() {
  const s = await one<{ id: number }>("SELECT id FROM sources WHERE url = 'discover://ai'");
  if (s) return s.id;
  // ふだんの巡回（enabled=1 の情報源）には含めない専用の行
  const [r] = await q<{ id: number }>(`INSERT INTO sources (name, kind, url, trust, enabled, note, created_at)
    VALUES ('AIで探す（公式サイト）', 'discover', 'discover://ai', 'official', 0, 'AIがWeb検索で見つけた公式ページ', $1)
    ON CONFLICT (url) DO UPDATE SET name = EXCLUDED.name RETURNING id`, [Date.now()]);
  return r.id;
}

export type Target = { pref: string; theme: string; from: string; to: string };

/** 検索の依頼（毎日の探索・まとめ探しで共通） */
export function searchParams(t: Target): Anthropic.MessageCreateParamsNonStreaming {
  return {
    model: collectModel(),
    max_tokens: 4000,
    tools: [{
      type: 'web_search_20250305', name: 'web_search', max_uses: MAX_SEARCHES, blocked_domains: BLOCKED_DOMAINS,
      user_location: { type: 'approximate', country: 'JP', timezone: 'Asia/Tokyo' },
    }],
    messages: [{
      role: 'user',
      content: `${t.pref}で ${t.from}〜${t.to} の間に開催予定の「${t.theme}」を探し、それぞれの**公式サイト**のページを見つけてください。
- 公式サイト＝主催者・実行委員会・自治体・観光協会のページ。まとめサイト・ポータル・ブログ・SNS・ニュースは使わない。
- 今年（${t.from.slice(0, 4)}年）以降の開催情報が載っているページだけ。過去の開催報告は除く。
- 最大8件。見つからなければ「なし」とだけ答える。
最後に、1行に1件ずつ「URL<タブ>イベント名」の形で書いてください（説明は不要）。`,
    }],
  } as Anthropic.MessageCreateParamsNonStreaming;
}

/** AI の答え（本文）から公式ページの URL だけを取り出す（除外ドメインは捨てる） */
export function parseUrls(content: Anthropic.ContentBlock[]): string[] {
  const text = content.map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  const urls: string[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'）)\]]+/g)) {
    const u = m[0].replace(/[。、.,]+$/, '');
    let host: string;
    try { host = new URL(u).hostname; } catch { continue; }
    if (BLOCKED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))) continue;
    if (!urls.includes(u)) urls.push(u);
  }
  return urls.slice(0, 8);
}

/** 費用の見積もり（円）：Web検索 $10/1,000回 ＋ Haiku のトークン。batch=true は AI の利用料が半額 */
export const YEN_PER_USD = 150;
export function costYen(u: { searches: number; input: number; output: number }, batch = false) {
  const k = batch ? 0.5 : 1;
  return (u.searches * 0.01 + (u.input * 0.10 + u.output * 0.50) / 1e6 * k) * YEN_PER_USD;
}

/** 今月の使用額（円）に足す */
export async function addSpend(yen: number) {
  const key = `discover_spend_${todayJST().slice(0, 7)}`;
  await setSetting(key, String((Number(await getSetting(key, '0')) || 0) + yen));
}
export async function monthSpend() {
  return Number(await getSetting(`discover_spend_${todayJST().slice(0, 7)}`, '0')) || 0;
}

/** AI に検索させ、公式ページの URL を返してもらう（本文に書かれた URL だけを使う） */
async function searchOfficialPages(t: Target) {
  client ??= new Anthropic();
  const params = searchParams(t);
  const messages = [...params.messages];
  const usage = { input: 0, output: 0, searches: 0 };
  let res: Anthropic.Message | null = null;
  for (let i = 0; i < 3; i++) {
    res = await client.messages.create({ ...params, messages });
    usage.input += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0);
    usage.output += res.usage.output_tokens;
    usage.searches += (res.usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
    if (res.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: res.content }); // 長い検索が一時停止したら、そのまま続けてもらう
  }
  if (!res || res.stop_reason === 'refusal') throw new Error('AIが処理を断りました');
  return { urls: parseUrls(res.content), usage };
}

/** 見つけた公式ページを（robots.txt を守って）取得し、「AI整理待ち」に入れる。取得済み（30日以内）は飛ばす */
export async function queuePage(url: string): Promise<'queued' | 'known' | 'blocked'> {
  const sourceId = await ensureSource();
  const prev = await one<{ fetched_at: number }>('SELECT fetched_at FROM crawl_pages WHERE url = $1', [url]);
  if (prev && Number(prev.fetched_at) > Date.now() - RECHECK_DAYS * 86400_000) return 'known';
  const page = await fetchPage(url).catch(() => null);
  if (!page) return 'blocked'; // robots.txt で禁止・取得失敗
  await q(`INSERT INTO crawl_pages (source_id, url, title, text_hash, text, links, status, attempts, error, fetched_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0, '', $7)
    ON CONFLICT (url) DO UPDATE SET title = $3, text_hash = $4, text = $5, links = $6, status = 'pending', attempts = 0, error = '', fetched_at = $7`,
    [sourceId, url, page.title.slice(0, 200), page.hash, page.text, JSON.stringify(page.links), Date.now()]);
  return 'queued';
}

export async function addLog(message: string) {
  const log = JSON.parse(await getSetting('discover_log', '[]')) as { at: number; message: string }[];
  await setSetting('discover_log', JSON.stringify([{ at: Date.now(), message }, ...log].slice(0, 30)));
}

/** 1回分の探索（毎日の追加分）：次の「都道府県 × テーマ」を探し、見つけた公式ページを「AI整理待ち」に入れる */
export async function runDiscover() {
  if (!extractorReady()) return { ok: false, message: 'ANTHROPIC_API_KEY が未設定のため、AIで探すことはできません' };
  const { budgetYen } = await discoverSettings();
  if ((await monthSpend()) + 6 > budgetYen) return { ok: false, message: `今月の上限（${budgetYen}円）に達したため、探していません` };
  const t = await nextTarget();
  await setSetting('discover_cursor', String(t.cursor + 1)); // 失敗しても次は別の組み合わせへ
  const { urls, usage } = await searchOfficialPages(t);
  await addSpend(costYen(usage));
  let queued = 0, known = 0, blocked = 0;
  for (const url of urls) {
    if (queued >= MAX_PAGES) break;
    const r = await queuePage(url);
    if (r === 'queued') queued++; else if (r === 'known') known++; else blocked++;
  }
  const message = `${t.pref}の「${t.theme}」：公式ページ ${urls.length}件を発見 → ${queued}件をAI整理待ちへ`
    + `${known ? `（取得済み ${known}件）` : ''}${blocked ? `（取得できない ${blocked}件）` : ''}・検索${usage.searches}回・約${Math.round(costYen(usage))}円`;
  await addLog(message);
  return { ok: true, message, queued, usage };
}
