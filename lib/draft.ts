/**
 * イベント下書き（JSON）の形式・チェック・変換。
 *
 * 今は「ガイドマップを見て人（Claude）が作った下書き」を管理画面に貼り付けて取り込む。
 * 将来の自動収集（公式サイト → AI で抽出）も、この同じ形式を出力すれば
 * 取り込み処理をそのまま使える。形式の説明は docs/DRAFT_FORMAT.md。
 */
import { CANVAS_W } from './canvas';
import { PREFECTURES } from './prefectures';
import { SHAPE_STYLES } from './shapes';

export type DraftPoint = [x: number, y: number]; // ガイドマップ画像上の位置（左上=0,0 / 右下=100,100 のパーセント）

export type Draft = {
  version: 1;
  event?: {
    name: string; genre: string; prefecture: string; start_date: string; end_date?: string;
    city?: string; venue_name?: string; address?: string; time_text?: string; summary?: string;
    organizer?: string; official_url?: string; access?: string; nearest_station?: string;
    traffic_info?: string; parking_info?: string; ticket_info?: string; extra_info?: string;
    source_url?: string; source_checked_at?: string;
  };
  map?: {
    aspect?: number; // ガイドマップ画像の 高さ÷幅（例: 横800×縦500 → 0.625）
    spots?: { category: string; name: string; note?: string; x: number; y: number }[];
    areas?: { style: string; label?: string; points: DraftPoint[] }[];
    lines?: { style: string; label?: string; points: DraftPoint[] }[];
  };
};

export type CheckedDraft = {
  errors: string[];
  warnings: string[];
  draft: Draft | null;
  summary: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_TEXT_FIELDS = ['city', 'venue_name', 'address', 'time_text', 'summary', 'organizer', 'official_url', 'access',
  'nearest_station', 'traffic_info', 'parking_info', 'ticket_info', 'extra_info', 'source_url', 'source_checked_at'] as const;

/** 貼り付けられた文字列をチェックする（DBに書き込む前に必ず通す） */
export function checkDraft(text: string, known: { genres: string[]; categories: string[] }, needEvent: boolean): CheckedDraft {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: unknown;
  try {
    // ```json ... ``` で囲まれていても受け付ける
    raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
  } catch {
    return { errors: ['JSONとして読み取れません。コピーした内容をそのまま貼り付けてください。'], warnings, draft: null, summary: '' };
  }
  const d = raw as Draft;
  if (!d || typeof d !== 'object') return { errors: ['下書きの形式が不正です'], warnings, draft: null, summary: '' };

  if (needEvent && !d.event) errors.push('新しいイベントとして登録するには event（イベント情報）が必要です');
  if (d.event) {
    const e = d.event;
    if (!e.name?.trim()) errors.push('event.name（イベント名）がありません');
    if (!known.genres.includes(e.genre)) errors.push(`event.genre「${e.genre}」は登録されていません（使えるもの: ${known.genres.join(', ')}）`);
    if (!PREFECTURES.includes(e.prefecture)) errors.push(`event.prefecture「${e.prefecture}」は都道府県名ではありません`);
    if (!DATE_RE.test(e.start_date ?? '')) errors.push('event.start_date は YYYY-MM-DD の形で入れてください');
    if (e.end_date && (!DATE_RE.test(e.end_date) || e.end_date < e.start_date)) errors.push('event.end_date が不正です');
    for (const k of ['official_url', 'source_url'] as const) if (e[k] && !/^https?:\/\//.test(e[k]!)) errors.push(`event.${k} は http(s):// から始めてください`);
    for (const k of EVENT_TEXT_FIELDS) if (e[k] != null && typeof e[k] !== 'string') errors.push(`event.${k} は文字列にしてください`);
    if (!e.source_url) warnings.push('情報元URL（event.source_url）がありません');
  }

  const m = d.map ?? {};
  const inRange = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === 'number' && v >= 0 && v <= 100);
  if (m.aspect != null && !(typeof m.aspect === 'number' && m.aspect > 0.1 && m.aspect < 5)) errors.push('map.aspect（縦÷横）が不正です');
  (m.spots ?? []).forEach((s, i) => {
    const at = `施設${i + 1}「${s?.name ?? ''}」`;
    if (!s?.name?.trim()) errors.push(`${at}: name がありません`);
    if (!known.categories.includes(s?.category)) errors.push(`${at}: category「${s?.category}」は登録されていません（使えるもの: ${known.categories.join(', ')}）`);
    if (!inRange([s?.x, s?.y])) errors.push(`${at}: x, y は 0〜100 の数で入れてください`);
  });
  for (const [list, kind, min] of [[m.areas, 'area', 3], [m.lines, 'line', 2]] as const) {
    (list ?? []).forEach((a, i) => {
      const at = `${kind === 'area' ? 'エリア' : '線'}${i + 1}「${a?.label ?? ''}」`;
      if (!SHAPE_STYLES.some((st) => st.key === a?.style && st.kind === kind)) {
        errors.push(`${at}: style「${a?.style}」は使えません（使えるもの: ${SHAPE_STYLES.filter((st) => st.kind === kind).map((st) => st.key).join(', ')}）`);
      }
      if (!Array.isArray(a?.points) || a.points.length < min || !a.points.every(inRange)) errors.push(`${at}: points は [x, y]（0〜100）を${min}点以上`);
    });
  }
  const nSpots = m.spots?.length ?? 0, nAreas = m.areas?.length ?? 0, nLines = m.lines?.length ?? 0;
  if (!d.event && nSpots + nAreas + nLines === 0) errors.push('取り込む内容がありません');
  if (d.map && m.aspect == null) warnings.push('map.aspect がないため、用紙の比率は 横1000×縦700 になります');

  const summary = [
    d.event ? `イベント「${d.event.name}」（${d.event.start_date}${d.event.end_date && d.event.end_date !== d.event.start_date ? `〜${d.event.end_date}` : ''}・${d.event.prefecture}）` : null,
    `施設 ${nSpots}件・エリア ${nAreas}件・線 ${nLines}件`,
  ].filter(Boolean).join(' / ');
  return { errors, warnings, draft: errors.length ? null : d, summary };
}

/** ガイドマップ上の位置（%）→ 用紙の座標 [y, x]（下が0） */
export function toCanvas(aspect: number | undefined) {
  const h = Math.round(CANVAS_W * (aspect ?? 0.7));
  const conv = ([x, y]: DraftPoint): [number, number] => [+(h - (y / 100) * h).toFixed(1), +((x / 100) * CANVAS_W).toFixed(1)];
  return { w: CANVAS_W, h, conv };
}
