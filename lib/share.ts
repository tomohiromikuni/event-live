/**
 * SNS共有用の文章とリンク。X の文字数（日本語は1文字=2、URLは23として数える・上限280）に収める。
 */
export const X_LIMIT = 280;
const URL_WEIGHT = 23;

/** X の数え方での文字数（全角=2、半角=1、URL=23） */
export function xLength(text: string): number {
  let n = 0;
  for (const part of text.split(/(https?:\/\/\S+)/)) {
    if (/^https?:\/\//.test(part)) { n += URL_WEIGHT; continue; }
    for (const ch of part) n += /[\u0000-ჿ -‍‐-‟′-‷]/.test(ch) ? 1 : 2;
  }
  return n;
}

/**
 * 本文行・URL・タグから投稿文を組み立てる。長すぎるときは本文の後ろの行から削り、最後は本文を切り詰める。
 * URL とタグは必ず残す。
 */
export function composePost(lines: string[], url: string, tags: string[], limit = X_LIMIT): string {
  const tail = `\n${url}\n${tags.join(' ')}`;
  const body = lines.filter(Boolean);
  while (body.length > 1 && xLength(body.join('\n') + tail) > limit) body.pop();
  let text = body.join('\n');
  while (text.length > 0 && xLength(text + tail) > limit) text = text.slice(0, -2) + '…';
  return text + tail;
}

/** 共有リンク（どこから来たか分かるように ref を付ける） */
export function shareUrl(base: string, path: string, ref: string) {
  return `${base}${path}${path.includes('?') ? '&' : '?'}ref=${encodeURIComponent(ref)}`;
}

/** X の投稿画面（本文にURLも含めて渡す） */
export const xIntent = (text: string) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
/** LINE の共有画面（本文にURLも含めて渡す） */
export const lineShare = (text: string) => `https://line.me/R/share?text=${encodeURIComponent(text)}`;
