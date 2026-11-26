import 'server-only';
import { headers } from 'next/headers';
import { isLang, lp, type Lang } from './i18n';

/** いまのページの言語（/en/… は英語、/zh/… は中国語など）。middleware.ts が伝える */
export async function getLang(): Promise<Lang> {
  const v = (await headers()).get('x-evenow-lang');
  return isLang(v) ? v : 'ja';
}

/** いまのパス（言語の切り替えリンク用） */
export async function currentPath(): Promise<string> {
  return (await headers()).get('x-evenow-path') || '/';
}

/** 別の言語の同じページ（/events/x ⇔ /en/events/x ⇔ /ko/events/x）。外国語版が無いページはその言語のトップへ */
export function langPath(path: string, to: Lang): string {
  const bare = path.replace(/^\/(en|zh-tw|zh|ko)(?=\/|$)/, '') || '/';
  if (to === 'ja') return bare;
  if (bare === '/' || bare.startsWith('/events/') || bare === '/search' || bare === '/guide') return `${lp(to)}${bare === '/' ? '' : bare}`;
  return lp(to);
}
