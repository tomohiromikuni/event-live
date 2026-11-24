/**
 * 簡易マップの図形の種類（EVENOW 共通デザイン）。
 * 公式ガイドマップのデザインを再現しないよう、形は「エリア（多角形）」と「線」のみ、
 * 色はここで決めた固定色だけを使う。
 */
export type ShapeKind = 'area' | 'line';
export type ShapeStyle = { key: string; kind: ShapeKind; name: string; color: string; dashed?: boolean };

export const SHAPE_STYLES: ShapeStyle[] = [
  { key: 'viewing', kind: 'area', name: '観覧エリア', color: '#7c3aed' },
  { key: 'food', kind: 'area', name: '屋台・飲食エリア', color: '#ea580c' },
  { key: 'stage', kind: 'area', name: 'ステージ周辺', color: '#c026d3' },
  { key: 'shop', kind: 'area', name: '物販・ブース', color: '#db2777' },
  { key: 'rest', kind: 'area', name: '休憩エリア', color: '#16a34a' },
  { key: 'parking', kind: 'area', name: '駐車場', color: '#4f46e5' },
  { key: 'closed', kind: 'area', name: '立入禁止', color: '#64748b', dashed: true },
  { key: 'other_area', kind: 'area', name: 'その他のエリア', color: '#0891b2' },
  { key: 'path', kind: 'line', name: '通路・動線', color: '#0f766e' },
  { key: 'route', kind: 'line', name: '推奨ルート', color: '#2563eb', dashed: true },
  { key: 'restriction', kind: 'line', name: '交通規制区間', color: '#dc2626', dashed: true },
];

export const shapeStyle = (key: string) => SHAPE_STYLES.find((s) => s.key === key) ?? SHAPE_STYLES[SHAPE_STYLES.length - 1];

export type MapShape = { id: number; event_id: number; kind: ShapeKind; style: string; label: string; coords: [number, number][]; sort: number };

/** 背景地図の表示方法 */
export const MAP_STYLES = [
  { key: 'light', name: '薄く表示（おすすめ）' },
  { key: 'normal', name: '通常' },
  { key: 'none', name: '非表示（簡易マップのみ）' },
] as const;
export type MapStyleKey = (typeof MAP_STYLES)[number]['key'];
