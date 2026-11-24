'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { q, tx, type Param } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { checkDraft, toCanvas } from '@/lib/draft';

export type ImportResult = { ok: boolean; errors: string[]; warnings: string[]; summary: string };

/**
 * 下書きJSON（lib/draft.ts の形式）をチェックし、問題なければ取り込む。
 * mode=new: 新しいイベントとして作成（非公開の状態 → 管理者が確認してから公開）
 * mode=<イベントID>: 既存イベントのマップに施設・エリア・線を追加
 * dry=1 のときはチェックだけ行う。
 */
export async function importDraft(_prev: ImportResult | null, f: FormData): Promise<ImportResult> {
  await requireAdmin();
  const mode = String(f.get('mode') ?? 'new') || 'new';
  const [genres, cats] = await Promise.all([
    q<{ id: number; slug: string }>('SELECT id, slug FROM genres'),
    q<{ id: number; slug: string }>('SELECT id, slug FROM spot_categories'),
  ]);
  const chk = checkDraft(String(f.get('json') ?? ''), { genres: genres.map((g) => g.slug), categories: cats.map((c) => c.slug) }, mode === 'new');
  const base = { errors: chk.errors, warnings: chk.warnings, summary: chk.summary };
  if (!chk.draft) return { ok: false, ...base };
  if (f.get('dry')) return { ok: true, ...base };

  const d = chk.draft;
  const catId = new Map(cats.map((c) => [c.slug, c.id]));
  const { w, h, conv } = toCanvas(d.map?.aspect);
  let eventId: number;
  try {
    eventId = await tx(async (tq) => {
      let eid: number;
      if (mode === 'new') {
        const e = d.event!;
        const now = Date.now();
        const cols: Record<string, Param> = {
          slug: `ev-${now.toString(36)}`, name: e.name.trim(), genre_id: genres.find((g) => g.slug === e.genre)!.id,
          prefecture: e.prefecture, start_date: e.start_date, end_date: e.end_date || e.start_date,
          city: e.city ?? '', venue_name: e.venue_name ?? '', address: e.address ?? '', time_text: e.time_text ?? '', summary: e.summary ?? '',
          organizer: e.organizer ?? '', official_url: e.official_url ?? '', access: e.access ?? '', nearest_station: e.nearest_station ?? '',
          traffic_info: e.traffic_info ?? '', parking_info: e.parking_info ?? '', ticket_info: e.ticket_info ?? '', extra_info: e.extra_info ?? '',
          source_url: e.source_url ?? '', source_checked_at: e.source_checked_at ?? '',
          published: 0, is_sample: 0, map_w: w, map_h: h, created_at: now, updated_at: now,
        };
        const keys = Object.keys(cols);
        eid = (await tq<{ id: number }>(`INSERT INTO events (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
          Object.values(cols)))[0].id;
      } else {
        eid = Number(mode);
        const ev = (await tq<{ map_h: number }>('SELECT map_h FROM events WHERE id = $1', [eid]))[0];
        if (!ev) throw new Error('対象のイベントが見つかりません');
        const [{ n }] = await tq<{ n: number }>(
          'SELECT ((SELECT COUNT(*) FROM spots WHERE event_id = $1) + (SELECT COUNT(*) FROM map_shapes WHERE event_id = $1))::int AS n', [eid]);
        if (n === 0) {
          // まだ何も描いていなければ、用紙の比率を下書きに合わせる
          await tq('UPDATE events SET map_w = $1, map_h = $2 WHERE id = $3', [w, h, eid]);
        } else if (Math.abs(ev.map_h - h) > 2) {
          throw new Error('このイベントにはすでに別の比率でマップが描かれています。既存の施設・エリアを削除してから取り込むか、新しいイベントとして取り込んでください');
        }
      }
      const m = d.map ?? {};
      for (const sp of m.spots ?? []) {
        const [y, x] = conv([sp.x, sp.y]);
        await tq(`INSERT INTO spots (event_id, category_id, name, note, lat, lng, sort)
          VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(MAX(sort), 0) + 1 FROM spots WHERE event_id = $1))`,
          [eid, catId.get(sp.category)!, sp.name.trim().slice(0, 60), (sp.note ?? '').slice(0, 100), y, x]);
      }
      for (const [kind, list] of [['area', m.areas], ['line', m.lines]] as const) {
        for (const a of list ?? []) {
          await tq(`INSERT INTO map_shapes (event_id, kind, style, label, coords, sort)
            VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(MAX(sort), 0) + 1 FROM map_shapes WHERE event_id = $1))`,
            [eid, kind, a.style, (a.label ?? '').slice(0, 40), JSON.stringify(a.points.map(conv))]);
        }
      }
      // 施設のカテゴリがジャンルの既定に無い場合は、イベント個別のカテゴリ設定に足す（公開ページで隠れないように）
      const used = [...new Set((m.spots ?? []).map((sp) => catId.get(sp.category)!))];
      if (used.length) {
        const own = await tq<{ category_id: number }>('SELECT category_id FROM event_categories WHERE event_id = $1', [eid]);
        const visible = own.length ? own.map((r) => r.category_id)
          : (await tq<{ category_id: number }>(
            'SELECT gc.category_id FROM genre_categories gc JOIN events e ON e.genre_id = gc.genre_id WHERE e.id = $1', [eid])).map((r) => r.category_id);
        if (used.some((c) => !visible.includes(c))) {
          for (const c of new Set([...visible, ...used])) {
            await tq('INSERT INTO event_categories (event_id, category_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [eid, c]);
          }
        }
      }
      return eid;
    });
  } catch (e) {
    return { ok: false, ...base, errors: [e instanceof Error ? e.message : String(e)] };
  }
  revalidatePath('/', 'layout');
  redirect(`/admin/events/${eventId}?imported=1`);
}
