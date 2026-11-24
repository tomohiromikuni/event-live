'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import { q, tx, type Param } from '@/lib/db';
import { adminPassword, endSession, requireAdmin, startSession } from '@/lib/admin';
import { PREFECTURES } from '@/lib/prefectures';
import { seedSamples } from '@/lib/seed';
import type { ReportOption } from '@/lib/types';
import { SHAPE_STYLES } from '@/lib/shapes';
import { CANVAS_W } from '@/lib/canvas';
import { cleanTag, OFFICIAL_TAG } from '@/lib/hashtags';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const n = (f: FormData, k: string) => Number(f.get(k));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function login(_prev: string | null, f: FormData): Promise<string | null> {
  const pw = adminPassword();
  if (pw === null) return '管理者パスワード（環境変数 ADMIN_PASSWORD）が未設定のため、ログインできません';
  const a = Buffer.from(s(f, 'password'));
  const b = Buffer.from(pw);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'パスワードが違います';
  await startSession();
  redirect('/admin');
}

export async function logout() {
  await endSession();
  redirect('/');
}

// ---------- イベント ----------
export async function saveEvent(_prev: string | null, f: FormData): Promise<string | null> {
  await requireAdmin();
  const id = n(f, 'id') || null;
  const slug = s(f, 'slug') || `ev-${Date.now().toString(36)}`;
  const v = {
    name: s(f, 'name'), genre_id: n(f, 'genre_id'), prefecture: s(f, 'prefecture'), city: s(f, 'city'),
    venue_name: s(f, 'venue_name'), address: s(f, 'address'),
    start_date: s(f, 'start_date'), end_date: s(f, 'end_date') || s(f, 'start_date'), time_text: s(f, 'time_text'),
    summary: s(f, 'summary'), organizer: s(f, 'organizer'), official_url: s(f, 'official_url'), access: s(f, 'access'),
    nearest_station: s(f, 'nearest_station'), traffic_info: s(f, 'traffic_info'), parking_info: s(f, 'parking_info'),
    ticket_info: s(f, 'ticket_info'), extra_info: s(f, 'extra_info'),
    // ハッシュタグ（空欄なら自動）。記号を除いて重複をなくし、#イベナウ以外で最大3個まで保存
    hashtags: cleanHashtags(s(f, 'hashtags')), status: s(f, 'status') || 'scheduled', status_note: s(f, 'status_note'),
    image_url: s(f, 'image_url'), image_credit: s(f, 'image_credit'), is_sample: f.get('is_sample') ? 1 : 0,
    is_featured: f.get('is_featured') ? 1 : 0, published: f.get('published') ? 1 : 0,
    source_url: s(f, 'source_url'), source_checked_at: s(f, 'source_checked_at'),
  };
  if (!v.name) return 'イベント名は必須です';
  if (!/^[a-z0-9-]+$/.test(slug)) return 'URL用ID（スラッグ）は半角英小文字・数字・ハイフンのみ使えます';
  if (!PREFECTURES.includes(v.prefecture)) return '都道府県を選択してください';
  if (!DATE_RE.test(v.start_date) || !DATE_RE.test(v.end_date) || v.end_date < v.start_date) return '開催日が不正です';
  if (!['scheduled', 'canceled', 'postponed'].includes(v.status)) return '開催状況が不正です';
  for (const u of [v.official_url, v.source_url, v.image_url]) if (u && !/^https?:\/\//.test(u)) return 'URLは http(s):// から入力してください';
  // 掲載基準: 会場マップがあるイベントだけを公開する（施設3件以上、うちトイレか駐車場が1件以上）
  if (v.published) {
    const ok = id ? await meetsPublishRule(id) : false;
    if (!ok) return PUBLISH_RULE_MSG;
  }
  const cats = f.getAll('categories').map(Number).filter(Boolean);

  let eventId: number;
  try {
    eventId = await tx(async (tq) => {
      const cols = Object.keys(v);
      const vals = Object.values(v) as Param[];
      const now = Date.now();
      let eid: number;
      if (id) {
        // $1 = slug, $2.. = 各カラム, 続いて updated_at, id
        await tq(`UPDATE events SET slug = $1, ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')},
          updated_at = $${cols.length + 2} WHERE id = $${cols.length + 3}`, [slug, ...vals, now, id]);
        eid = id;
      } else {
        const ph = cols.map((_, i) => `$${i + 2}`).join(', ');
        eid = (await tq<{ id: number }>(`INSERT INTO events (slug, ${cols.join(', ')}, created_at, updated_at)
          VALUES ($1, ${ph}, $${cols.length + 2}, $${cols.length + 2}) RETURNING id`, [slug, ...vals, now]))[0].id;
      }
      await tq('DELETE FROM event_categories WHERE event_id = $1', [eid]);
      if (f.get('custom_categories')) {
        for (const c of cats) await tq('INSERT INTO event_categories (event_id, category_id) VALUES ($1, $2)', [eid, c]);
      }
      return eid;
    });
  } catch (e) {
    if (String(e).includes('unique') || String(e).includes('duplicate')) return 'このURL用IDはすでに使われています';
    throw e;
  }
  revalidatePath('/', 'layout');
  redirect(`/admin/events/${eventId}?saved=1`);
}

export async function deleteEvent(f: FormData) {
  await requireAdmin();
  await q('DELETE FROM events WHERE id = $1', [n(f, 'id')]);
  revalidatePath('/', 'layout');
  redirect('/admin');
}

/** サンプルイベントを削除して、今日を基準にした日程で作り直す（デモ用） */
export async function resetSamples() {
  await requireAdmin();
  await tx((tq) => seedSamples(tq));
  revalidatePath('/', 'layout');
  redirect('/admin?reset=1');
}

// ---------- 地点 ----------
export async function addSpot(f: FormData) {
  await requireAdmin();
  const eid = n(f, 'event_id');
  const lat = n(f, 'lat'), lng = n(f, 'lng');
  if (!s(f, 'name') || !Number.isFinite(lat) || !Number.isFinite(lng) || f.get('lat') === '') return;
  await q(`INSERT INTO spots (event_id, category_id, name, note, lat, lng, sort)
    VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort), 0) + 1 FROM spots WHERE event_id = $1))`,
    [eid, n(f, 'category_id'), s(f, 'name'), s(f, 'note'), lat, lng]);
  revalidatePath(`/admin/events/${eid}`);
}

export async function updateSpot(f: FormData) {
  await requireAdmin();
  await q('UPDATE spots SET category_id = $1, name = $2, note = $3 WHERE id = $4', [n(f, 'category_id'), s(f, 'name'), s(f, 'note'), n(f, 'id')]);
  revalidatePath(`/admin/events/${n(f, 'event_id')}`);
}

export async function moveSpot(id: number, lat: number, lng: number) {
  await requireAdmin();
  if (!Number.isInteger(id) || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
  await q('UPDATE spots SET lat = $1, lng = $2 WHERE id = $3', [lat, lng, id]);
}

export async function deleteSpot(f: FormData) {
  await requireAdmin();
  await q('DELETE FROM spots WHERE id = $1', [n(f, 'id')]);
  revalidatePath(`/admin/events/${n(f, 'event_id')}`);
}

// ---------- 簡易マップ（エリア・線） ----------
/** 用紙（見取り図）の縦の長さをガイドマップの比率に合わせる。横幅は CANVAS_W で固定 */
export async function setCanvasSize(eventId: number, h: number) {
  await requireAdmin();
  if (!Number.isInteger(eventId) || !Number.isFinite(h)) return;
  await q('UPDATE events SET map_w = $1, map_h = $2 WHERE id = $3', [CANVAS_W, Math.round(Math.min(Math.max(h, 200), 5000)), eventId]);
  revalidatePath(`/admin/events/${eventId}`);
}

function cleanCoords(coords: unknown): [number, number][] | null {
  if (!Array.isArray(coords) || coords.length < 2 || coords.length > 200) return null;
  const out: [number, number][] = [];
  for (const c of coords) {
    if (!Array.isArray(c) || c.length !== 2) return null;
    const [lat, lng] = c.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 10000 || Math.abs(lng) > 10000) return null;
    out.push([+lat.toFixed(6), +lng.toFixed(6)]); // 緯度経度（地図モード）でも精度が落ちないように6桁
  }
  return out;
}

export async function addShape(eventId: number, style: string, label: string, coords: [number, number][]): Promise<string | null> {
  await requireAdmin();
  const st = SHAPE_STYLES.find((x) => x.key === style);
  const c = cleanCoords(coords);
  if (!st || !c || !Number.isInteger(eventId)) return '図形のデータが不正です';
  if (st.kind === 'area' && c.length < 3) return 'エリアは3点以上で囲んでください';
  await q(`INSERT INTO map_shapes (event_id, kind, style, label, coords, sort)
    VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort), 0) + 1 FROM map_shapes WHERE event_id = $1))`,
    [eventId, st.kind, st.key, label.trim().slice(0, 40), JSON.stringify(c)]);
  return null;
}

export async function updateShape(f: FormData) {
  await requireAdmin();
  const st = SHAPE_STYLES.find((x) => x.key === s(f, 'style'));
  if (!st) return;
  // 種類はエリア同士・線同士でのみ変更可能
  await q('UPDATE map_shapes SET style = $1, label = $2 WHERE id = $3 AND kind = $4', [st.key, s(f, 'label').slice(0, 40), n(f, 'id'), st.kind]);
  revalidatePath(`/admin/events/${n(f, 'event_id')}`);
}

export async function deleteShape(f: FormData) {
  await requireAdmin();
  await q('DELETE FROM map_shapes WHERE id = $1', [n(f, 'id')]);
  revalidatePath(`/admin/events/${n(f, 'event_id')}`);
}

// ---------- 投稿・通報 ----------
export async function moderateReport(f: FormData) {
  await requireAdmin();
  const id = n(f, 'id');
  const op = s(f, 'op');
  if (op === 'hide') await q('UPDATE reports SET hidden = 1 WHERE id = $1', [id]);
  if (op === 'show') await q('UPDATE reports SET hidden = 0 WHERE id = $1', [id]);
  if (op === 'delete') await q('DELETE FROM reports WHERE id = $1', [id]);
  if (op === 'resolve' || op === 'hide' || op === 'show') await q('UPDATE report_flags SET resolved = 1 WHERE report_id = $1', [id]);
  revalidatePath('/admin/reports');
}

// ---------- 設定（ジャンル・カテゴリ・投稿選択肢） ----------
export async function saveGenre(f: FormData) {
  await requireAdmin();
  const id = n(f, 'id') || null;
  const slug = s(f, 'slug');
  const vals: Param[] = [s(f, 'name'), s(f, 'icon') || '🎉', s(f, 'color') || '#64748b', s(f, 'info_fields'), n(f, 'sort') || 0];
  if (!vals[0] || (!id && !/^[a-z0-9_-]+$/.test(slug))) return;
  await tx(async (tq) => {
    const gid = id
      ? (await tq('UPDATE genres SET name = $1, icon = $2, color = $3, info_fields = $4, sort = $5 WHERE id = $6', [...vals, id]), id)
      : (await tq<{ id: number }>('INSERT INTO genres (slug, name, icon, color, info_fields, sort) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING RETURNING id', [slug, ...vals]))[0]?.id;
    if (!gid) return;
    await tq('DELETE FROM genre_categories WHERE genre_id = $1', [gid]);
    for (const c of f.getAll('categories').map(Number)) await tq('INSERT INTO genre_categories (genre_id, category_id) VALUES ($1, $2)', [gid, c]);
  });
  revalidatePath('/', 'layout');
}

export async function saveCategory(f: FormData) {
  await requireAdmin();
  const id = n(f, 'id') || null;
  const rt = n(f, 'report_type_id') || null;
  const vals: Param[] = [s(f, 'name'), s(f, 'icon') || '📍', s(f, 'color') || '#64748b', rt, n(f, 'sort') || 0];
  if (!vals[0]) return;
  if (id) await q('UPDATE spot_categories SET name = $1, icon = $2, color = $3, report_type_id = $4, sort = $5 WHERE id = $6', [...vals, id]);
  else if (/^[a-z0-9_-]+$/.test(s(f, 'slug'))) {
    await q('INSERT INTO spot_categories (slug, name, icon, color, report_type_id, sort) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (slug) DO NOTHING', [s(f, 'slug'), ...vals]);
  }
  revalidatePath('/', 'layout');
}

/** 選択肢は「値|表示名|レベル(0-4)」を1行ずつ */
export async function saveReportType(f: FormData) {
  await requireAdmin();
  const id = n(f, 'id') || null;
  const options: ReportOption[] = s(f, 'options').split('\n').map((l) => l.split('|').map((x) => x.trim()))
    .filter((p) => p.length === 3 && /^[a-z0-9_-]+$/i.test(p[0]) && p[1])
    .map(([value, label, level]) => ({ value, label, level: Math.min(4, Math.max(0, Number(level) || 0)) }));
  if (!s(f, 'name') || options.length === 0) return;
  if (id) await q('UPDATE report_types SET name = $1, options = $2 WHERE id = $3', [s(f, 'name'), JSON.stringify(options), id]);
  else if (/^[a-z0-9_-]+$/.test(s(f, 'slug'))) {
    await q('INSERT INTO report_types (slug, name, options) VALUES ($1, $2, $3) ON CONFLICT (slug) DO NOTHING', [s(f, 'slug'), s(f, 'name'), JSON.stringify(options)]);
  }
  revalidatePath('/', 'layout');
}

// ---------- 掲載基準 ----------
const PUBLISH_RULE_MSG = '公開するには会場マップが必要です（施設3件以上、うちトイレか駐車場が1件以上）。「公開する」のチェックを外して保存し、マップを作ってから公開してください';

/** 会場マップが掲載基準を満たしているか（施設3件以上、うちトイレか駐車場が1件以上） */
async function meetsPublishRule(eventId: number): Promise<boolean> {
  const [r] = await q<{ total: number; key: number }>(`SELECT COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE c.slug IN ('toilet', 'parking'))::int AS key
    FROM spots s JOIN spot_categories c ON c.id = s.category_id WHERE s.event_id = $1`, [eventId]);
  return r.total >= 3 && r.key >= 1;
}

/** 管理画面で入力されたハッシュタグを整える（#イベナウ は自動で先頭に付くので保存しない） */
function cleanHashtags(raw: string): string {
  const out: string[] = [];
  for (const t of raw.split(/[\s,、]+/).map(cleanTag)) {
    if (t && t !== OFFICIAL_TAG && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 3).join(' ');
}
