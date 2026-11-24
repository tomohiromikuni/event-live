'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { one, q, tx, type Param } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { PREFECTURES } from '@/lib/prefectures';
import { todayJST } from '@/lib/dates';
import { runCollect, setSetting } from '@/lib/collect/run';
import type { Extracted } from '@/lib/collect/extract';

const s = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- 情報源 ----------
export async function saveSource(_prev: string | null, f: FormData): Promise<string | null> {
  await requireAdmin();
  const id = Number(f.get('id')) || null;
  const url = s(f, 'url');
  const kind = s(f, 'kind') === 'rss' ? 'rss' : 'page';
  const trust = ['official', 'public', 'other'].includes(s(f, 'trust')) ? s(f, 'trust') : 'other';
  const terms = s(f, 'terms_checked_at');
  const enabled = f.get('enabled') ? 1 : 0;
  if (!s(f, 'name')) return '名前を入力してください';
  if (!/^https?:\/\/[^\s]+$/.test(url)) return 'URLは http(s):// から入力してください';
  if (terms && !DATE_RE.test(terms)) return '利用規約の確認日は日付で入力してください';
  if (enabled && !terms) return '利用規約（自動での取得・転載の禁止がないか）を確認し、確認日を入れてから有効にしてください';
  const pref = PREFECTURES.includes(s(f, 'prefecture')) ? s(f, 'prefecture') : '';
  const interval = Math.min(Math.max(Number(f.get('interval_hours')) || 24, 6), 24 * 7);
  const vals: Param[] = [s(f, 'name').slice(0, 80), kind, url, pref, trust, terms, enabled, interval, s(f, 'note').slice(0, 300)];
  try {
    if (id) await q('UPDATE sources SET name=$1, kind=$2, url=$3, prefecture=$4, trust=$5, terms_checked_at=$6, enabled=$7, interval_hours=$8, note=$9 WHERE id=$10', [...vals, id]);
    else await q('INSERT INTO sources (name, kind, url, prefecture, trust, terms_checked_at, enabled, interval_hours, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [...vals, Date.now()]);
  } catch (e) {
    if (String(e).includes('unique') || String(e).includes('duplicate')) return 'このURLはすでに登録されています';
    throw e;
  }
  revalidatePath('/admin/sources');
  return null;
}

export async function deleteSource(f: FormData) {
  await requireAdmin();
  await q('DELETE FROM sources WHERE id = $1', [Number(f.get('id'))]);
  revalidatePath('/admin/sources');
}

// ---------- 実行・設定 ----------
export async function setCollectEnabled(f: FormData) {
  await requireAdmin();
  await setSetting('collect_enabled', f.get('on') === '1' ? '1' : '0');
  revalidatePath('/admin/collect');
}

export async function runCollectNow() {
  await requireAdmin();
  await runCollect('manual');
  revalidatePath('/admin/collect');
  revalidatePath('/admin/candidates');
  redirect('/admin/collect?ran=1');
}

// ---------- 候補 ----------
type CandRow = { id: number; data: string; source_url: string; match_event_id: number | null; status: string };

async function loadCandidate(id: number) {
  const c = await one<CandRow>('SELECT id, data, source_url, match_event_id, status FROM event_candidates WHERE id = $1', [id]);
  if (!c || c.status !== 'pending') throw new Error('この候補はすでに処理されています');
  return { ...c, d: JSON.parse(c.data) as Extracted & { map_links?: string[] } };
}

/** 承認：非公開のイベントを作成する（マップを作ってから公開する方針のため、公開はしない） */
export async function approveCandidate(_prev: string | null, f: FormData): Promise<string | null> {
  await requireAdmin();
  const c = await loadCandidate(Number(f.get('id')));
  const d = c.d;
  const name = s(f, 'name') || d.name;
  const start = s(f, 'start_date') || d.start_date || '';
  const end = s(f, 'end_date') || d.end_date || start;
  const pref = s(f, 'prefecture') || d.prefecture || '';
  if (!DATE_RE.test(start) || !DATE_RE.test(end) || end < start) return '開催日が未確認です。公式の情報で確認して入力してください';
  if (!PREFECTURES.includes(pref)) return '都道府県が未確認です。確認して選択してください';
  const genre = await one<{ id: number }>('SELECT id FROM genres WHERE slug = $1', [d.genre]) ?? await one<{ id: number }>("SELECT id FROM genres WHERE slug = 'other'");
  const now = Date.now();
  const v = (x: string | null | undefined) => x ?? '';
  const eventId = await tx(async (tq) => {
    const [{ id }] = await tq<{ id: number }>(`INSERT INTO events (slug, name, genre_id, prefecture, city, venue_name, address, start_date, end_date, time_text,
        summary, organizer, official_url, access, nearest_station, traffic_info, parking_info, ticket_info, status,
        source_url, source_checked_at, published, is_sample, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,0,0,$22,$22) RETURNING id`,
      [`ev-${now.toString(36)}`, name.slice(0, 120), genre!.id, pref, v(d.city), v(d.venue_name), v(d.address), start, end, v(d.time_text),
        v(d.summary), v(d.organizer), v(d.official_url), v(d.access), v(d.nearest_station), v(d.traffic_info), v(d.parking_info), v(d.ticket_info),
        d.status === 'canceled' || d.status === 'postponed' ? d.status : 'scheduled', c.source_url, todayJST(), now]);
    await tq("UPDATE event_candidates SET status = 'approved', event_id = $1, updated_at = $2 WHERE id = $3", [id, now, c.id]);
    return id;
  });
  revalidatePath('/admin/candidates');
  // 公式のマイマップへのリンクがあれば、そのまま会場マップの取り込みへ
  const map = d.map_links?.[0];
  redirect(map ? `/admin/import?event=${eventId}&mymap=${encodeURIComponent(map)}` : `/admin/events/${eventId}?created=1`);
}

/** 既存イベントに反映：日程・開催状況・情報元だけを更新する（毎年開催の次回日程など） */
export async function mergeCandidate(f: FormData) {
  await requireAdmin();
  const c = await loadCandidate(Number(f.get('id')));
  const target = Number(f.get('event_id')) || c.match_event_id;
  if (!target) return;
  const d = c.d;
  const sets: string[] = [], vals: Param[] = [];
  const add = (col: string, val: Param) => { vals.push(val); sets.push(`${col} = $${vals.length}`); };
  if (d.start_date) { add('start_date', d.start_date); add('end_date', d.end_date ?? d.start_date); }
  if (d.time_text) add('time_text', d.time_text);
  if (d.status === 'canceled' || d.status === 'postponed') add('status', d.status);
  add('source_url', c.source_url); add('source_checked_at', todayJST()); add('updated_at', Date.now());
  vals.push(target);
  await tx(async (tq) => {
    await tq(`UPDATE events SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
    await tq("UPDATE event_candidates SET status = 'merged', event_id = $1, updated_at = $2 WHERE id = $3", [target, Date.now(), c.id]);
  });
  revalidatePath('/', 'layout');
  redirect(`/admin/events/${target}?saved=1`);
}

export async function rejectCandidate(f: FormData) {
  await requireAdmin();
  await q("UPDATE event_candidates SET status = 'rejected', updated_at = $1 WHERE id = $2 AND status = 'pending'", [Date.now(), Number(f.get('id'))]);
  revalidatePath('/admin/candidates');
}
