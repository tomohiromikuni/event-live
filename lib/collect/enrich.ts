import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { one, q } from '../db';
import { fetchHtml, htmlToPage } from './web';
import { collectModel, extractorReady } from './extract';
import { addSpend, costYen, discoverSettings, monthSpend } from './discover';
import { cleanInfoText } from '../infoText';

/**
 * 公式情報の補完：カードの「公式情報」（駐車場・シャトルバス・交通規制・トイレ）が空のとき、
 * 公式サイトの「アクセス・駐車場・トイレ・シャトルバス」などのページを読んで、書かれている内容だけを入れる（推測しない）。
 * 空の項目だけを埋める（管理画面で入れた内容は上書きしない）。同じイベントは30日に1回まで。費用は1件1〜2円（月の上限金額の中）。
 */
const KEY = /(アクセス|交通|駐車|パーキング|トイレ|シャトル|臨時バス|会場案内|来場|access|parking|traffic|toilet|shuttle)/i;
const FIELDS = ['parking_info', 'shuttle_info', 'traffic_info', 'toilet_info', 'city', 'address'] as const;
type Info = Record<(typeof FIELDS)[number], string>;

const SCHEMA = {
  type: 'object', additionalProperties: false, required: [...FIELDS],
  properties: Object.fromEntries(FIELDS.map((f) => [f, { type: 'string' }])),
};
const SYSTEM = `あなたはイベントの公式ページから、来場者向けの情報だけを抜き出す係です。
- parking_info：駐車場（場所・台数・料金・臨時駐車場・「駐車場はありません、公共交通機関で」などの案内）
- shuttle_info：シャトルバス・臨時バス（乗り場・運行時間・料金）
- traffic_info：交通規制・通行止め・周辺道路の案内
- toilet_info：トイレ（場所・仮設トイレ・利用できる施設）
- city：会場の市区町村（例：「洞爺湖町」「札幌市」）。address：会場の住所（都道府県から。番地が無ければ地区名まで）
本文に書かれている内容だけを、来場者が読んで分かるように短く（各120字以内）まとめる。書かれていなければ空文字（「記載はありません」などと書かない）。
対象のイベント以外の情報（別の催し・別の年）は使わない。推測で補わない。`;

/** 内側のリンクから、アクセス・駐車場などのページを探す（同じサイト内・最大 limit 件） */
function infoPages(html: string, base: string, limit = 3): string[] {
  const host = new URL(base).host;
  const out: { url: string; score: number }[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: string;
    try { url = new URL(m[1], base).toString(); } catch { continue; }
    const u = new URL(url);
    if (u.host !== host || url === base || /\.(png|jpe?g|gif|webp|pdf|zip|docx?|xlsx?)(\?|$)/i.test(u.pathname)) continue;
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    const score = (KEY.test(text) ? 2 : 0) + (KEY.test(u.pathname) ? 1 : 0);
    if (score > 0 && !out.some((o) => o.url === url)) out.push({ url, score });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit).map((o) => o.url);
}

let client: Anthropic | null = null;

export async function enrichOfficialInfo(eventId: number): Promise<string> {
  const ev = await one<Info & { name: string; official_url: string; source_url: string; enrich_at: number }>(
    'SELECT name, official_url, source_url, enrich_at, parking_info, shuttle_info, traffic_info, toilet_info, city, address FROM events WHERE id = $1', [eventId]);
  if (!ev) return '';
  const empty = FIELDS.filter((f) => !ev[f]?.trim());
  if (!empty.length) return '';
  if (Date.now() - ev.enrich_at < 30 * 86400_000) return '';
  if (!extractorReady()) return '';
  const { budgetYen } = await discoverSettings();
  if ((await monthSpend()) + 3 > budgetYen) return '公式情報の補完：今月の上限金額に達したため見送りました';
  await q('UPDATE events SET enrich_at = $1 WHERE id = $2', [Date.now(), eventId]);

  // 公式ページ（と情報元）＋その中の「アクセス・駐車場・トイレ」などのページ
  const roots = [ev.official_url, ev.source_url].filter((u, i, a) => u && /^https?:/.test(u) && a.indexOf(u) === i);
  const texts: string[] = [];
  const seen = new Set<string>();
  for (const root of roots) {
    const html = await fetchHtml(root).catch(() => null);
    if (!html) continue;
    seen.add(root);
    texts.push(`【${root}】\n${htmlToPage(root, html).text.slice(0, 6000)}`);
    for (const sub of infoPages(html, root)) {
      if (seen.has(sub) || seen.size >= 5) continue;
      seen.add(sub);
      const h = await fetchHtml(sub).catch(() => null);
      if (h) texts.push(`【${sub}】\n${htmlToPage(sub, h).text.slice(0, 6000)}`);
    }
  }
  if (!texts.length) return '公式情報の補完：公式ページを読めませんでした';

  client ??= new Anthropic();
  const res = await client.beta.messages.create({
    model: collectModel(),
    max_tokens: 1500,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `イベント名：${ev.name}\n\n${texts.join('\n\n').slice(0, 20_000)}` }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
  } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);
  const input = res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0);
  await addSpend(costYen({ searches: 0, input, output: res.usage.output_tokens }));
  if (res.stop_reason === 'refusal') return '公式情報の補完：AIが処理を断りました';
  const got = JSON.parse(res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')) as Partial<Info>;
  const filled: string[] = [];
  for (const f of empty) {
    const raw = (got[f] ?? '').trim();
    const v = (f === 'city' || f === 'address' ? raw.slice(0, f === 'city' ? 20 : 120) : cleanInfoText(raw).slice(0, 300));
    if (!v) continue;
    await q(`UPDATE events SET ${f} = $1, updated_at = $2 WHERE id = $3 AND ${f} = ''`, [v, Date.now(), eventId]);
    filled.push({ parking_info: '駐車場', shuttle_info: 'シャトルバス', traffic_info: '交通規制', toilet_info: 'トイレ', city: '市区町村', address: '住所' }[f]);
  }
  return filled.length
    ? `公式サイト（${seen.size}ページ）から ${filled.join('・')} を入れました`
    : `公式サイト（${seen.size}ページ）に、駐車場・トイレなどの案内は見つかりませんでした`;
}
