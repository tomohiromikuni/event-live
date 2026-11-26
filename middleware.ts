import { NextResponse, type NextRequest } from 'next/server';

/**
 * 管理画面の入り口を、推測されにくい URL に分ける。
 * - 環境変数 ADMIN_ENTRY_PATH（例: "k3f9-x2q7-..."）を設定すると、/<ADMIN_ENTRY_PATH> でだけログイン画面を開ける。
 * - そのとき /admin-login を直接開くと「ページが見つかりません」になる。
 * - 未設定のとき（ローカル開発など）は従来どおり /admin-login でログインできる。
 * 値はリポジトリに書かず、Vercel の環境変数にだけ置く。
 */
function entryPath() {
  return (process.env.ADMIN_ENTRY_PATH || '').trim().replace(/^\/+|\/+$/g, '');
}

/**
 * 外国語版（/en・/zh・/zh-tw・/ko）かどうかと、いまのパスをページに伝える（<html lang>・言語の切り替えリンクに使う）。
 * 中国語・韓国語のページは英語版のページ（app/(site)/en/…）を同じ作りで使う（中で言語を切り替える）。
 */
function withLang(req: NextRequest) {
  const h = new Headers(req.headers);
  const path = req.nextUrl.pathname;
  const m = path.match(/^\/(en|zh-tw|zh|ko)(?=\/|$)/);
  h.set('x-evenow-lang', m ? m[1] : 'ja');
  h.set('x-evenow-path', path);
  if (m && m[1] !== 'en') {
    const url = req.nextUrl.clone();
    url.pathname = `/en${path.slice(m[0].length)}`;
    return NextResponse.rewrite(url, { request: { headers: h } });
  }
  return NextResponse.next({ request: { headers: h } });
}

export function middleware(req: NextRequest) {
  const entry = entryPath();
  if (!entry) return withLang(req);
  // 日本語などを含む値でも一致するよう、URLの文字をもとに戻して比べる（末尾の / も無視）
  let pathname = req.nextUrl.pathname;
  try { pathname = decodeURIComponent(pathname); } catch { /* そのまま */ }
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '');

  if (pathname === `/${entry}`) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin-login';
    const res = NextResponse.rewrite(url);
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    res.headers.set('Cache-Control', 'no-store');
    return res;
  }
  if (pathname === '/admin-login') {
    // 存在しないページと同じ表示（404）にする
    const url = req.nextUrl.clone();
    url.pathname = '/__not-found';
    return NextResponse.rewrite(url);
  }
  return withLang(req);
}

export const config = {
  // 画像・JS などの静的ファイルと API 以外の全ページで判定する（入り口の URL はどんな文字列でもよいため）
  matcher: ['/((?!_next/|api/|og/|icon|apple-icon|og\\.png|robots\\.txt|sitemap\\.xml).*)'],
};
