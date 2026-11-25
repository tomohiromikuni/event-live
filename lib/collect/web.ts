import 'server-only';
import { createHash } from 'node:crypto';

/**
 * 情報源の取得（ルールを守った取得だけを行う）
 * - robots.txt で禁止されたページは取得しない
 * - 名乗る（User-Agent にサービス名と連絡先ページ）
 * - 同じサイトへは間隔をあける・大きすぎるページは読まない
 */
const UA = `EVENOW-bot/1.0 (+${process.env.NEXT_PUBLIC_SITE_URL || 'https://www.evenow.jp'}/about)`;
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 15_000;
const lastHit = new Map<string, number>();
const robotsCache = new Map<string, { at: number; rules: { allow: boolean; path: string }[] }>();

async function politeWait(host: string) {
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + 1500 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit.set(host, Date.now());
}

async function rawFetch(url: string): Promise<{ status: number; type: string; body: string }> {
  const u = new URL(url);
  await politeWait(u.host);
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  const type = res.headers.get('content-type') ?? '';
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) throw new Error('ページが大きすぎるため読み込みませんでした');
  // 文字コード（Shift_JIS 等の古い自治体サイトにも対応）
  const head = new TextDecoder('latin1').decode(buf.slice(0, 2048));
  const charset = (type.match(/charset=([\w-]+)/i)?.[1] || head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]
    || head.match(/encoding=["']([\w-]+)/i)?.[1] || 'utf-8').toLowerCase();
  let body: string;
  try { body = new TextDecoder(charset).decode(buf); } catch { body = new TextDecoder('utf-8').decode(buf); }
  return { status: res.status, type, body };
}

/** robots.txt の判定（User-agent: * と EVENOW-bot のグループ。Allow/Disallow は最長一致） */
export async function robotsAllows(url: string): Promise<boolean> {
  const u = new URL(url);
  let entry = robotsCache.get(u.origin);
  if (!entry || Date.now() - entry.at > 6 * 3600_000) {
    let rules: { allow: boolean; path: string }[] = [];
    try {
      const r = await rawFetch(`${u.origin}/robots.txt`);
      if (r.status === 200) rules = parseRobots(r.body);
      // 401/403 は「全面禁止」とみなす
      if (r.status === 401 || r.status === 403) rules = [{ allow: false, path: '/' }];
    } catch { /* 取得できない場合は制限なしとみなす（一般的な扱い） */ }
    entry = { at: Date.now(), rules };
    robotsCache.set(u.origin, entry);
  }
  const path = u.pathname + u.search;
  let best: { allow: boolean; path: string } | null = null;
  for (const r of entry.rules) {
    if (r.path && path.startsWith(r.path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
  }
  return best ? best.allow : true;
}

export function parseRobots(txt: string) {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = line.replace(/#.*/, '').trim().match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'allow' || key === 'disallow') && cur) {
      if (val) cur.rules.push({ allow: key === 'allow', path: val.replace(/\*.*$/, '') });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a.startsWith('evenow')));
  const pick = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return pick.flatMap((g) => g.rules);
}

export type Page = { url: string; title: string; text: string; hash: string; links: string[] };

/** ページを取得して本文テキストにする（robots.txt で禁止なら null） */
export async function fetchPage(url: string): Promise<Page | null> {
  if (!(await robotsAllows(url))) return null;
  const r = await rawFetch(url);
  if (r.status >= 400) throw new Error(`取得できませんでした（HTTP ${r.status}）`);
  return htmlToPage(url, r.body);
}

export function htmlToPage(url: string, html: string): Page {
  const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  // Google マイマップへのリンク（会場マップの元データになる）
  const links = [...new Set([...html.matchAll(/href=["']([^"']*google\.[a-z.]+\/maps\/d\/[^"']*)["']/gi)].map((m) => decode(m[1])))].slice(0, 5);
  let body = html
    .replace(/<(script|style|noscript|svg|iframe|template)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const main = body.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? body.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  if (main && main.length > 200) body = main;
  const text = decode(body.replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|dd|dt|th|td|section)>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split('\n').map((l) => l.replace(/[ \t　]+/g, ' ').trim()).filter(Boolean).join('\n')
    .slice(0, 15_000); // AIに送る量を抑える
  return { url, title, text, hash: createHash('sha256').update(text).digest('hex').slice(0, 32), links };
}

/** RSS / Atom の記事一覧（新しい順に最大 limit 件） */
export async function fetchFeed(url: string, limit = 20): Promise<{ title: string; link: string }[] | null> {
  if (!(await robotsAllows(url))) return null;
  const r = await rawFetch(url);
  if (r.status >= 400) throw new Error(`フィードを取得できませんでした（HTTP ${r.status}）`);
  const items = [...r.body.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0]);
  return items.slice(0, limit).map((it) => ({
    title: decode(it.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim(),
    link: decode(it.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? it.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ?? '').trim(),
  })).filter((x) => /^https?:\/\//.test(x.link));
}

function decode(s: string) {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

/** robots.txt を守って HTML をそのまま取る（ガイドマップの画像を探すため）。禁止なら null */
export async function fetchHtml(url: string): Promise<string | null> {
  if (!(await robotsAllows(url))) return null;
  const r = await rawFetch(url);
  return r.status === 200 && /html/i.test(r.type) ? r.body : null;
}

/** robots.txt を守って画像などのファイルを取る（メモリ上で使うだけ。保存しない）。禁止・大きすぎ・失敗なら null */
export async function fetchBinary(url: string, maxBytes = 4_500_000): Promise<{ type: string; data: Buffer } | null> {
  if (!(await robotsAllows(url))) return null;
  const u = new URL(url);
  await politeWait(u.host);
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' });
  if (!res.ok) return null;
  const len = Number(res.headers.get('content-length') || 0);
  if (len > maxBytes) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength > maxBytes) return null;
  return { type: (res.headers.get('content-type') ?? '').split(';')[0].trim(), data: buf };
}
