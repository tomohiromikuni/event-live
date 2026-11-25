import SimpleModePanel from '@/components/admin/SimpleModePanel';
import { autoHashtags } from '@/lib/hashtags';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import EventForm from '@/components/admin/EventForm';
import MapEditor from '@/components/admin/MapEditor';
import { formData } from '@/lib/admin-data';
import { eventCategories, eventShapes, eventSpots, getEventById } from '@/lib/queries';
import { autoMapFromOsm, deleteEvent } from '../../actions';
import { one } from '@/lib/db';

export default async function EditEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; imported?: string; osm?: string }> }) {
  const id = Number((await params).id);
  const { saved, imported, osm } = await searchParams;
  const e = await getEventById(id);
  if (!e) notFound();
  const [spots, cats, fd, shapes] = await Promise.all([eventSpots(e.id), eventCategories(e.id, e.genre_id), formData(e.id), eventShapes(e.id)]);
  // 公式サイトが情報源として登録済みか（登録すれば、公式ページの変更が「候補」として届く）
  const src = e.official_url ? await one<{ id: number; enabled: number }>('SELECT id, enabled FROM sources WHERE url = $1', [e.official_url]) : undefined;
  return (
    <>
      <div className="section-head">
        <h1 style={{ fontSize: 19, margin: 0 }}>{e.name}</h1>
        <Link href={`/events/${e.slug}`} target="_blank">公開ページ ↗</Link>
      </div>
      {saved && <div className="flash">保存しました</div>}
      {osm && <div className="flash">🗺️ 自動取得：{osm}</div>}
      {imported && <div className="flash">下書きを取り込みました。マップの位置を確認・調整し、内容に問題がなければ下の「公開する」にチェックして保存してください。</div>}
      {/^ev-[a-z0-9]+$/.test(e.slug) && (
        <div className="cand-match">URLが自動の文字列（/events/{e.slug}）のままです。検索で見つけてもらいやすいよう、下の「URL用ID」にイベント名のローマ字（例: sumida-hanabi）を入れて保存してください。</div>
      )}
      {e.official_url && !src && (
        <div className="small" style={{ margin: '6px 0' }}>
          <Link href={`/admin/sources?url=${encodeURIComponent(e.official_url)}&name=${encodeURIComponent(`${e.name} 公式サイト`)}&pref=${encodeURIComponent(e.prefecture)}&trust=official#add`}>
            公式サイトを情報源に登録する →</Link>（登録すると、公式ページの変更（駐車場・シャトルバス・交通規制など）が「候補」として届きます）
        </div>
      )}
      {!e.published && <div className="banner postponed">🔒 このイベントは<strong>非公開</strong>です（一般の人には表示されません）</div>}
      <SimpleModePanel eventId={e.id} simple={e.map_mode === 'simple'} items={spots.filter((sp) => sp.generic).map((sp) => sp.name)} hasMap={spots.some((sp) => !sp.generic) || shapes.length > 0} />
      <form action={autoMapFromOsm} className="small" style={{ margin: '8px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input type="hidden" name="id" value={e.id} />
        <button className="btn sm ghost">🗺️ 会場マップを自動作成</button>
        <span className="muted">① 会場から700m以内の常設のトイレ・駐車場（OpenStreetMap）② 公式ページのガイドマップから仮設トイレ・臨時駐車場・シャトル乗り場などを「目安」で追加（誤差が大きければ追加しません）</span>
      </form>
      <MapEditor eventId={e.id} canvas={{ w: e.map_w, h: e.map_h }} geo={e.map_mode === 'geo'} center={e.lat || e.lng ? [e.lat, e.lng] : undefined} spots={spots.filter((sp) => !sp.generic)} shapes={shapes} categories={cats} />
      <h2 style={{ fontSize: 17, marginTop: 24 }}>イベント情報の編集</h2>
      <EventForm event={e} {...fd} autoTags={autoHashtags({ ...e, genre_slug: fd.genres.find((g) => g.id === e.genre_id)?.slug })} />
      <form action={deleteEvent} className="panel">
        <input type="hidden" name="id" value={e.id} />
        <h2>イベントの削除</h2>
        <p className="muted small">地点・投稿もすべて削除されます。開催中止の場合は削除せず「開催状況」を中止にしてください。</p>
        <button className="btn danger sm">このイベントを削除</button>
      </form>
    </>
  );
}
