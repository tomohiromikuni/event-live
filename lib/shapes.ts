/**
 * 簡易マップの図形の種類（EVENOW 共通デザイン）。
 * 公式ガイドマップのデザインを再現しないよう、形は「エリア（多角形）」と「線」のみ、
 * 色はここで決めた固定色だけを使う。
 */
export type ShapeKind = 'area' | 'line';
export type ShapeStyle = { key: string; kind: ShapeKind; name: string; color: string; dashed?: boolean };

export const SHAPE_STYLES: ShapeStyle[] = [
  { key: 'venue', kind: 'area', name: '会場の範囲', color: '#e11d48', dashed: true },
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

/**
 * 公開ページの会場マップは「簡易マップ」にする（著作権への配慮と、見やすさのため）。
 * - 位置という事実だけを示し、ガイドマップの細かい形・線・配色は再現しない
 * - エリアは 飲食・駐車場・立入禁止・観覧 だけを、外形をなぞらず「四角」に簡略化して表示
 * - 線（通路・推奨ルート・交通規制区間）は出さない（交通規制は駐車場カードの文章で案内）
 * 管理画面で描いた元のデータは消さない（表示のときに簡略化するだけ）。
 */
export const PUBLIC_AREA_STYLES = ['venue', 'food', 'parking', 'closed', 'viewing'];
/** 公開マップに出す施設の種類（カードの4つ＋入口・救護所） */
export const PUBLIC_SPOT_CATS = ['parking', 'shuttle', 'toilet', 'gate', 'first_aid']; // 飲食・屋台の混雑は扱わない（エリアの四角は位置の目安として残す）

export function simplifyShapes(shapes: MapShape[]): MapShape[] {
  return shapes
    .filter((s) => s.kind === 'area' && PUBLIC_AREA_STYLES.includes(s.style) && s.coords.length >= 3)
    .map((s) => {
      // 会場の範囲は OpenStreetMap の外形（公式のガイドマップではない）なので、そのまま薄く囲う
      if (s.style === 'venue') return s;
      const ys = s.coords.map((c) => c[0]), xs = s.coords.map((c) => c[1]);
      const [y0, y1, x0, x1] = [Math.min(...ys), Math.max(...ys), Math.min(...xs), Math.max(...xs)];
      return { ...s, coords: [[y0, x0], [y0, x1], [y1, x1], [y1, x0]] as [number, number][] };
    });
}
