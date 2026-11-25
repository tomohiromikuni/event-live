/**
 * ジャンル・施設カテゴリの線画アイコン（24×24、線のみ・currentColor）。
 * スラッグで引き当て、該当が無い（管理画面で追加した種類など）場合は登録済みの絵文字を使う。
 */
const GENRE: Record<string, string> = {
  fireworks: '<circle cx="12" cy="12" r="2.6"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M18.7 5.3l-2.8 2.8M8.1 15.9l-2.8 2.8"/>',
  festival: '<path d="M12 1.5v2.5M9 4h6M9 20h6M12 20v2.5"/><rect x="5.5" y="4" width="13" height="16" rx="6.5"/><path d="M6 9.5h12M6 14.5h12"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  marche: '<path d="M3 10h18l-2 10.5H5z"/><path d="M7.5 10l3-6M16.5 10l-3-6M9.5 14v3M14.5 14v3"/>',
  food: '<path d="M7 3v7a2 2 0 0 0 4 0V3M9 12v9M17 21v-8c-2 0-3-1.5-3-5s1.3-5 3-5z"/>',
  expo: '<path d="M3 21h18M5 21V8.5L12 4l7 4.5V21M9 21v-5h6v5"/>',
  anime_game: '<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><circle cx="15.5" cy="11.5" r=".8"/><circle cx="17.8" cy="13.8" r=".8"/>',
  sports: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5l4 2.9-1.5 4.6h-5L8 10.4z"/><path d="M12 3v4.5M16 10.4l4.3-1.4M14.5 15l2.6 3.7M9.5 15l-2.6 3.7M8 10.4L3.7 9"/>',
  local: '<path d="M3 21h18M4 10h16M12 3l8 7H4zM6.5 10v11M10 10v11M14 10v11M17.5 10v11"/>',
  seasonal: '<path d="M5 19C5 10 10 5 20 5c0 10-5 15-14 14.5"/><path d="M5 19l8.5-8.5"/>',
  other: '<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',
};

const CATEGORY: Record<string, string> = {
  gate: '<path d="M5.5 21V4.5a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5V21M3 21h18"/><circle cx="15" cy="12.5" r="1"/>',
  toilet: '<circle cx="6.5" cy="4.5" r="1.8"/><circle cx="17.5" cy="4.5" r="1.8"/><path d="M4.5 9h4v6.5M4.5 9v6.5M5.5 15.5V21M7.5 15.5V21M17.5 8.5l-3.2 8h6.4zM16.3 16.5V21M18.7 16.5V21M12 3v18"/>',
  food: '<path d="M3.5 11.5h17a8.5 8.5 0 0 1-17 0zM9 21h6M13.5 3L10 9.5M18.5 4l-5 5.5"/>',
  parking: '<rect x="3" y="3" width="18" height="18" rx="4.5"/><path d="M9.5 17V7h3.5a3 3 0 0 1 0 6H9.5"/>',
  traffic: '<path d="M3.5 16.5v-4.5L6 6.5h12l2.5 5.5v4.5zM3.5 12h17"/><circle cx="7.5" cy="16.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>',
  shuttle: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v3M16 18v3"/><circle cx="8" cy="14.5" r=".6"/><circle cx="16" cy="14.5" r=".6"/>',
  stage: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7"/>',
  merch: '<path d="M5 8h14l-1 13H6zM9 8V6.5a3 3 0 0 1 6 0V8"/>',
  viewing: '<path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  rest: '<path d="M4 11.5h16M6 11.5V7h12v4.5M5 11.5L4 19M19 11.5l1 7.5M7.5 15.5h9"/>',
  first_aid: '<rect x="3" y="6.5" width="18" height="14" rx="3"/><path d="M9 6.5V4h6v2.5M12 10.5v6M9 13.5h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.2"/>',
};

export type IconKind = 'genre' | 'category';

/** SVG 文字列を返す（地図マーカーなど HTML 文字列で使う場所向け）。該当なしなら null */
export function iconSvg(kind: IconKind, slug: string, size = 20, strokeWidth = 2.2): string | null {
  const body = (kind === 'genre' ? GENRE : CATEGORY)[slug];
  if (!body) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** HTML 文字列用：線画アイコン、無ければ絵文字（エスケープ済み） */
export function iconHtml(kind: IconKind, slug: string, emoji: string, size = 20): string {
  return iconSvg(kind, slug, size) ?? emoji.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
