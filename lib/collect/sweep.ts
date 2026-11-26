import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { one, q } from '../db';
import { addDays, todayJST } from '../dates';
import { extractorReady } from './extract';
import { getSetting, setSetting } from './run';
import { addLog, addSpend, costYen, discoverSettings, monthSpend, parseUrls, queuePage, searchParams, seasonThemes, type Target } from './discover';

/**
 * まとめ探し（月1回）：対象の都道府県 × 季節のテーマ（例 47 × 2 = 94通り）を、Message Batches API でまとめて検索する。
 * - バッチは AI の利用料が半額（Web検索の料金は同じ）。結果は最大24時間以内に返る → 次の定期実行で受け取る。
 * - 受け取った公式ページの URL は一覧（sweep_queue）に入れ、定期実行のたびに少しずつ取得して「AI整理待ち」へ（実行時間の上限に収めるため）。
 * - 月の上限金額（管理画面で設定）を超えそうなら送らない。
 */
const DRAIN_PER_CALL = 8; // 1回の呼び出しで取得する公式ページの数
const EST_YEN_PER_REQUEST = 5; // 1件あたりの見積もり（検索3回＋AI）

let client: Anthropic | null = null;

async function plan(): Promise<Target[]> {
  const today = todayJST(), to = addDays(today, 60);
  const themes = seasonThemes(Number(addDays(today, 30).slice(5, 7)));
  const { prefs } = await discoverSettings();
  return prefs.flatMap((pref) => themes.map((theme) => ({ pref, theme, from: today, to })));
}

/** 今月のまとめ探しを送る（送っていなければ）。上限金額を超えそうなら送らない */
export async function submitMonthlySweep(force = false): Promise<string | null> {
  const month = todayJST().slice(0, 7);
  if (!force && (await getSetting('sweep_month', '')) === month) return null;
  if ((await getSetting('sweep_batch', '')) !== '') return null; // 前のバッチの受け取り待ち
  const targets = await plan();
  const { budgetYen } = await discoverSettings();
  const est = targets.length * EST_YEN_PER_REQUEST;
  if ((await monthSpend()) + est > budgetYen) {
    await setSetting('sweep_month', month);
    const m = `まとめ探しを送りませんでした：見積もり約${est}円が今月の上限（${budgetYen}円）を超えるため（対象の都道府県を絞るか、上限を上げてください）`;
    await addLog(m);
    return m;
  }
  client ??= new Anthropic();
  const batch = await client.messages.batches.create({
    requests: targets.map((t, i) => ({ custom_id: `s${i}`, params: searchParams(t) })),
  });
  await setSetting('sweep_month', month);
  await setSetting('sweep_batch', batch.id);
  await setSetting('sweep_targets', JSON.stringify(targets.map((t) => [t.pref, t.theme])));
  const m = `まとめ探しを送りました（${targets.length}通り・見積もり約${est}円・結果は24時間以内）`;
  await addLog(m);
  return m;
}

/** 送ったまとめ探しが終わっていれば受け取り、見つけた URL を一覧に入れる */
export async function collectSweepResults(): Promise<string | null> {
  const id = await getSetting('sweep_batch', '');
  if (!id) return null;
  client ??= new Anthropic();
  const b = await client.messages.batches.retrieve(id);
  if (b.processing_status !== 'ended') return `まとめ探しの結果待ち（処理中 ${b.request_counts.processing}件）`;
  const targets = JSON.parse(await getSetting('sweep_targets', '[]')) as [string, string][];
  const usage = { searches: 0, input: 0, output: 0 };
  let found = 0, failed = 0;
  for await (const r of await client.messages.batches.results(id)) {
    if (r.result.type !== 'succeeded') { failed++; continue; }
    const msg = r.result.message;
    usage.input += msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0);
    usage.output += msg.usage.output_tokens;
    usage.searches += (msg.usage as { server_tool_use?: { web_search_requests?: number } }).server_tool_use?.web_search_requests ?? 0;
    const [pref, theme] = targets[Number(r.custom_id.slice(1))] ?? ['', ''];
    // AI は有名な順に挙げる → その順位を覚えて、全国の「1番目」から先に取得する
    for (const [rank, url] of parseUrls(msg.content).entries()) {
      const ins = await q(`INSERT INTO sweep_queue (url, pref, theme, status, found_at, rank) VALUES ($1, $2, $3, 'new', $4, $5) ON CONFLICT (url) DO NOTHING RETURNING url`,
        [url, pref, theme, Date.now(), rank]);
      found += ins.length;
    }
  }
  const yen = costYen(usage, true);
  await addSpend(yen);
  await setSetting('sweep_batch', '');
  const m = `まとめ探しの結果：公式ページ ${found}件を発見${failed ? `（失敗 ${failed}件）` : ''}・検索${usage.searches}回・約${Math.round(yen)}円`;
  await addLog(m);
  return m;
}

/** 一覧の URL を少しずつ取得して「AI整理待ち」へ。残りがあれば false */
export async function drainSweepQueue(): Promise<{ done: boolean; queued: number }> {
  const rows = await q<{ url: string }>(`SELECT url FROM sweep_queue WHERE status = 'new' ORDER BY rank, found_at LIMIT $1`, [DRAIN_PER_CALL]);
  let queued = 0;
  for (const r of rows) {
    const res = await queuePage(r.url).catch(() => 'blocked' as const);
    if (res === 'queued') queued++;
    await q('UPDATE sweep_queue SET status = $1 WHERE url = $2', [res, r.url]);
  }
  const left = await one<{ n: number }>("SELECT COUNT(*)::int AS n FROM sweep_queue WHERE status = 'new'");
  return { done: (left?.n ?? 0) === 0, queued };
}

/** 定期実行の1回分：①今月分を送る ②終わっていれば受け取る ③一覧を少しずつ取得。まだ作業があれば done:false */
export async function runSweepStep() {
  if (!extractorReady()) return { done: true, message: 'ANTHROPIC_API_KEY が未設定' };
  const msgs = [await submitMonthlySweep(), await collectSweepResults()].filter(Boolean) as string[];
  const d = await drainSweepQueue();
  if (d.queued) msgs.push(`公式ページ ${d.queued}件をAI整理待ちへ`);
  return { done: d.done, message: msgs.join(' ／ ') || '作業なし' };
}

export async function sweepStatus() {
  const [counts] = await q<{ new: number; queued: number; other: number }>(`SELECT
    COUNT(*) FILTER (WHERE status = 'new')::int AS new, COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
    COUNT(*) FILTER (WHERE status NOT IN ('new', 'queued'))::int AS other FROM sweep_queue`);
  return { month: await getSetting('sweep_month', ''), pending: !!(await getSetting('sweep_batch', '')), ...counts, spend: await monthSpend() };
}
