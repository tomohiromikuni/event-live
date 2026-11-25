import 'server-only';
import type { Q } from './db';

/**
 * 会場マップがないイベントの「かんたん表示」。
 * 地図の代わりに、ジャンルに応じた決まった項目（会場・入口／駐車場（会場周辺）／トイレ／飲食・屋台／交通・道路 など）を用意し、
 * 来場者はこれまでと同じワンタップで状況を投稿する。自由文の投稿はしない（一人での運営で見張りきれないため）。
 * 会場マップを描くと自動で通常表示に切り替わり、これらの項目は削除される。
 */
type Item = { cat: string; name: string };

export function simpleItems(_genreSlug: string, opt: { shuttle?: boolean } = {}): Item[] {
  // 方針：詳細ページのカードは 駐車場・シャトルバス・トイレ・飲食 の4つ（交通規制は駐車場カード内の公式情報）。
  // 以前の項目（会場・入口／観覧場所／物販／周辺の道路）は、既存のイベントでは削除せず画面に出さないだけ
  const items: Item[] = [
    { cat: 'parking', name: '駐車場（周辺）' },
    { cat: 'toilet', name: 'トイレ' },
    { cat: 'food', name: '飲食・屋台' },
  ];
  // シャトルバスは運行があるイベント（公式情報にシャトルバスの記載がある）だけ
  if (opt.shuttle) items.splice(1, 0, { cat: 'shuttle', name: 'シャトルバス' });
  return items;
}

/** かんたん表示にする（会場マップの施設・図形がまだ無いときだけ） */
export async function enableSimpleMode(tq: Q, eventId: number): Promise<string | null> {
  const ev = (await tq<{ map_mode: string; genre: string; shuttle_info: string }>(
    'SELECT e.map_mode, e.shuttle_info, g.slug AS genre FROM events e JOIN genres g ON g.id = e.genre_id WHERE e.id = $1', [eventId]))[0];
  if (!ev) return 'イベントが見つかりません';
  if (ev.map_mode === 'simple') return null;
  const [{ n }] = await tq<{ n: number }>(`SELECT ((SELECT COUNT(*) FROM spots WHERE event_id = $1 AND generic = 0)
    + (SELECT COUNT(*) FROM map_shapes WHERE event_id = $1))::int AS n`, [eventId]);
  if (n > 0) return 'すでに会場マップに施設・エリアがあります。かんたん表示にするには、先にそれらを削除してください';
  const cats = await tq<{ id: number; slug: string }>('SELECT id, slug FROM spot_categories');
  const catId = new Map(cats.map((c) => [c.slug, c.id]));
  const items = simpleItems(ev.genre, { shuttle: !!ev.shuttle_info }).filter((it) => catId.has(it.cat));
  await addItems(tq, eventId, items, catId);
  await tq("UPDATE events SET map_mode = 'simple' WHERE id = $1", [eventId]);
  return null;
}

async function addItems(tq: Q, eventId: number, items: Item[], catId: Map<string, number>) {
  for (const [i, it] of items.entries()) {
    await tq('INSERT INTO spots (event_id, category_id, name, note, lat, lng, sort, generic) VALUES ($1, $2, $3, $4, 0, 0, $5, 1)',
      [eventId, catId.get(it.cat)!, it.name, '', i]);
  }
  // 項目のカテゴリがジャンルの既定に無い場合は、イベント個別のカテゴリ設定に足す（公開ページで隠れないように）
  const own = await tq<{ category_id: number }>('SELECT category_id FROM event_categories WHERE event_id = $1', [eventId]);
  const visible = own.length ? own.map((r) => r.category_id)
    : (await tq<{ category_id: number }>('SELECT gc.category_id FROM genre_categories gc JOIN events e ON e.genre_id = gc.genre_id WHERE e.id = $1', [eventId])).map((r) => r.category_id);
  const used = items.map((it) => catId.get(it.cat)!);
  if (used.some((c) => !visible.includes(c))) {
    for (const c of new Set([...visible, ...used])) await tq('INSERT INTO event_categories (event_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eventId, c]);
  }
}

/** かんたん表示のイベントで、あとからシャトルバスの情報が入ったら項目を足す（項目は消さない：投稿が残っているため） */
export async function syncSimpleItems(tq: Q, eventId: number) {
  const ev = (await tq<{ map_mode: string; genre: string; shuttle_info: string }>(
    'SELECT e.map_mode, e.shuttle_info, g.slug AS genre FROM events e JOIN genres g ON g.id = e.genre_id WHERE e.id = $1', [eventId]))[0];
  if (ev?.map_mode !== 'simple') return;
  const cats = await tq<{ id: number; slug: string }>('SELECT id, slug FROM spot_categories');
  const catId = new Map(cats.map((c) => [c.slug, c.id]));
  const have = new Set((await tq<{ category_id: number }>('SELECT category_id FROM spots WHERE event_id = $1 AND generic = 1', [eventId])).map((r) => r.category_id));
  const all = simpleItems(ev.genre, { shuttle: !!ev.shuttle_info }).filter((it) => catId.has(it.cat));
  const missing = all.filter((it) => !have.has(catId.get(it.cat)!));
  if (missing.length === 0) return;
  await addItems(tq, eventId, missing, catId);
  // 並び順を項目の順にそろえる
  for (const [i, it] of all.entries()) await tq('UPDATE spots SET sort = $1 WHERE event_id = $2 AND generic = 1 AND category_id = $3', [i, eventId, catId.get(it.cat)!]);
}

/** かんたん表示をやめる（会場マップを描き始めたとき）。自動で用意した項目は削除する */
export async function leaveSimpleMode(tq: Q, eventId: number, mode: 'canvas' | 'geo' = 'canvas') {
  const ev = (await tq<{ map_mode: string }>('SELECT map_mode FROM events WHERE id = $1', [eventId]))[0];
  if (ev?.map_mode !== 'simple') return;
  await tq('DELETE FROM spots WHERE event_id = $1 AND generic = 1', [eventId]);
  await tq('UPDATE events SET map_mode = $1 WHERE id = $2', [mode, eventId]);
}
