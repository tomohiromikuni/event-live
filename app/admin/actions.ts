'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import { db, tx } from '@/lib/db';
import { adminPassword, endSession, requireAdmin, startSession } from '@/lib/admin';
import { PREFECTURES } from '@/lib/prefectures';
import type { ReportOption } from '@/lib/types';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const n = (f: FormData, k: string) => Number(f.get(k));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function login(_prev: string | null, f: FormData): Promise<string | null> {
  const a = Buffer.from(s(f, 'password'));
  const b = Buffer.from(adminPassword());
  if (a.length !== b.length || !timingSafeEqual(a, b)) return 'パスワードが違います';
  await startSession();
  redirect('/admin');
}

export async function logout() {
  await endSession();
  redirect('/admin-login');
}

// ---------- イベント ----------
export async function saveEvent(_prev: string | null, f: FormData): Promise<string | null> {
  await requireAdmin();
  const id = n(f, 'id') || null;
  const slug = s(f, 'slug') || `ev-${Date.now().toString(36)}`;
  const v = {
    name: s(f, 'name'), genre_id: n(f, 'genre_id'), prefecture: s(f, 'prefecture'), city: s(f, 'city'),
    venue_name: s(f, 'venue_name'), address: s(f, 'address'), lat: n(f, 'lat'), lng: n(f, 'lng'), zoom: n(f, 'zoom') || 16,
    start_date: s(f, 'start_date'), end_date: s(f, 'end_date') || s(f, 'start_date'), time_text: s(f, 'time_text'),
    summary: s(f, 'summary'), organizer: s(f, 'organizer'), official_url: s(f, 'official_url'), access: s(f, 'access'),
    nearest_station: s(f, 'nearest_station'), traffic_info: s(f, 'traffic_info'), parking_info: s(f, 'parking_info'),
    ticket_info: s(f, 'ticket_info'), extra_info: s(f, 'extra_info'), status: s(f, 'status') || 'scheduled', status_note: s(f, 'status_note'),
    image_url: s(f, 'image_url'), image_credit: s(f, 'image_credit'), is_sample: f.get('is_sample') ? 1 : 0,
    is_featured: f.get('is_featured') ? 1 : 0, published: f.get('published') ? 1 : 0,
    source_url: s(f, 'source_url'), source_checked_at: s(f, 'source_checked_at'),
  };
  if (!v.name) return 'イベント名は必須です';
  if (!/^[a-z0-9-]+$/.test(slug)) return 'URL用ID（スラッグ）は半角英小文字・数字・ハイフンのみ使えます';
  if (!PREFECTURES.includes(v.prefecture)) return '都道府県を選択してください';
  if (!DATE_RE.test(v.start_date) || !DATE_RE.test(v.end_date) || v.end_date < v.start_date) return '開催日が不正です';
  if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || Math.abs(v.lat) > 90 || Math.abs(v.lng) > 180 || (!v.lat && !v.lng)) return '会場の緯度・経度を入力してください';
  if (!['scheduled', 'canceled', 'postponed'].includes(v.status)) return '開催状況が不正です';
  for (const u of [v.official_url, v.source_url, v.image_url]) if (u && !/^https?:\/\//.test(u)) return 'URLは http(s):// から入力してください';
  const cats = f.getAll('categories').map(Number).filter(Boolean);

  let eventId: number;
  try {
    eventId = tx((d) => {
      const cols = Object.keys(v);
      const now = Date.now();
      let eid: number;
      if (id) {
        d.prepare(`UPDATE events SET slug = ?, ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`)
          .run(slug, ...Object.values(v), now, id);
        eid = id;
      } else {
        eid = Number(d.prepare(`INSERT INTO events (slug, ${cols.join(', ')}, created_at, updated_at) VALUES (?, ${cols.map(() => '?').join(', ')}, ?, ?)`)
          .run(slug, ...Object.values(v), now, now).lastInsertRowid);
      }
      d.prepare('DELETE FROM event_categories WHERE event_id = ?').run(eid);
      if (f.get('custom_categories')) {
        const ins = d.prepare('INSERT INTO event_categories (event_id, category_id) VALUES (?, ?)');
        for (const c of cats) ins.run(eid, c);
      }
      return eid;
    });
  } catch (e) {
    if (String(e).includes('UNIQUE')) return 'このURL用IDはすでに使われています';
    throw e;
  }
  revalidatePath('/', 'layout');
  redirect(`/admin/events/${eventId}?saved=1`);
}

export async function deleteEvent(f: FormData) {
  await requireAdmin();
  db().prepare('DELETE FROM events WHERE id = ?').run(n(f, 'id'));
  revalidatePath('/', 'layout');
  redirect('/admin');
}

// ---------- 地点 ----------
export async function addSpot(f: FormData) {
  await requireAdmin();
  const eid = n(f, 'event_id');
  const lat = n(f, 'lat'), lng = n(f, 'lng');
  if (!s(f, 'name') || !Number.isFinite(lat) || !Number.isFinite(lng) || !lat) return;
  db().prepare('INSERT INTO spots (event_id, category_id, name, note, lat, lng, sort) VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM spots WHERE event_id = ?))')
    .run(eid, n(f, 'category_id'), s(f, 'name'), s(f, 'note'), lat, lng, eid);
  revalidatePath(`/admin/events/${eid}`);
}

export async function updateSpot(f: FormData) {
  await requireAdmin();
  db().prepare('UPDATE spots SET category_id = ?, name = ?, note = ? WHERE id = ?').run(n(f, 'category_id'), s(f, 'name'), s(f, 'note'), n(f, 'id'));
  revalidatePath(`/admin/events/${n(f, 'event_id')}`);
}

export async function moveSpot(id: number, lat: number, lng: number) {
  await requireAdmin();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
  db().prepare('UPDATE spots SET lat = ?, lng = ? WHERE id = ?').run(lat, lng, id);
}

export async function deleteSpot(f: FormData) {
  await requireAdmin();
  db().prepare('DELETE FROM spots WHERE id = ?').run(n(f, 'id'));
  revalidatePath(`/admin/events/${n(f, 'event_id')}`);
}

// ---------- 投稿・通報 ----------
export async function moderateReport(f: FormData) {
  await requireAdmin();
  const id = n(f, 'id');
  const op = s(f, 'op');
  const d = db();
  if (op === 'hide') d.prepare('UPDATE reports SET hidden = 1 WHERE id = ?').run(id);
  if (op === 'show') d.prepare('UPDATE reports SET hidden = 0 WHERE id = ?').run(id);
  if (op === 'delete') d.prepare('DELETE FROM reports WHERE id = ?').run(id);
  if (op === 'resolve' || op === 'hide' || op === 'show') d.prepare('UPDATE report_flags SET resolved = 1 WHERE report_id = ?').run(id);
  revalidatePath('/admin/reports');
}

// ---------- 設定（ジャンル・カテゴリ・投稿選択肢） ----------
export async function saveGenre(f: FormData) {
  await requireAdmin();
  const id = n(f, 'id') || null;
  const slug = s(f, 'slug');
  const vals = [s(f, 'name'), s(f, 'icon') || '🎉', s(f, 'color') || '#64748b', s(f, 'info_fields'), n(f, 'sort') || 0];
  if (!vals[0] || (!id && !/^[a-z0-9_-]+$/.test(slug))) return;
  tx((d) => {
    const gid = id
      ? (d.prepare('UPDATE genres SET name = ?, icon = ?, color = ?, info_fields = ?, sort = ? WHERE id = ?').run(...vals, id), id)
      : Number(d.prepare('INSERT INTO genres (slug, name, icon, color, info_fields, sort) VALUES (?, ?, ?, ?, ?, ?)').run(slug, ...vals).lastInsertRowid);
    d.prepare('DELETE FROM genre_categories WHERE genre_id = ?').run(gid);
    const ins = d.prepare('INSERT INTO genre_categories (genre_id, category_id) VALUES (?, ?)');
    for (const c of f.getAll('categories').map(Number)) ins.run(gid, c);
  });
  revalidatePath('/', 'layout');
}

export async function saveCategory(f: FormData) {
  await requireAdmin();
  const id = n(f, 'id') || null;
  const rt = n(f, 'report_type_id') || null;
  const vals = [s(f, 'name'), s(f, 'icon') || '📍', s(f, 'color') || '#64748b', rt, n(f, 'sort') || 0];
  if (!vals[0]) return;
  if (id) db().prepare('UPDATE spot_categories SET name = ?, icon = ?, color = ?, report_type_id = ?, sort = ? WHERE id = ?').run(...vals, id);
  else if (/^[a-z0-9_-]+$/.test(s(f, 'slug'))) db().prepare('INSERT INTO spot_categories (slug, name, icon, color, report_type_id, sort) VALUES (?, ?, ?, ?, ?, ?)').run(s(f, 'slug'), ...vals);
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
  if (id) db().prepare('UPDATE report_types SET name = ?, options = ? WHERE id = ?').run(s(f, 'name'), JSON.stringify(options), id);
  else if (/^[a-z0-9_-]+$/.test(s(f, 'slug'))) db().prepare('INSERT INTO report_types (slug, name, options) VALUES (?, ?, ?)').run(s(f, 'slug'), s(f, 'name'), JSON.stringify(options));
  revalidatePath('/', 'layout');
}
