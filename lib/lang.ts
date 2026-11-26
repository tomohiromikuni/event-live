import 'server-only';
import { headers } from 'next/headers';
import type { Lang } from './i18n';

/** いまのページの言語（/en/… は英語）。middleware.ts が伝える */
export async function getLang(): Promise<Lang> {
  return (await headers()).get('x-evenow-lang') === 'en' ? 'en' : 'ja';
}

/** いまのパス（言語の切り替えリンク用） */
export async function currentPath(): Promise<string> {
  return (await headers()).get('x-evenow-path') || '/';
}

/** 反対の言語の同じページ（/events/x ⇔ /en/events/x）。英語版が無いページは英語のトップへ */
export function otherLangPath(path: string, lang: Lang): string {
  if (lang === 'en') return path.replace(/^\/en(?=\/|$)/, '') || '/';
  if (path === '/' || path.startsWith('/events/') || path === '/search') return `/en${path === '/' ? '' : path}`;
  return '/en';
}
