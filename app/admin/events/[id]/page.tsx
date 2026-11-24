import Link from 'next/link';
import { notFound } from 'next/navigation';
import EventForm from '@/components/admin/EventForm';
import MapEditor from '@/components/admin/MapEditor';
import { formData } from '@/lib/admin-data';
import { eventCategories, eventShapes, eventSpots, getEventById } from '@/lib/queries';
import { deleteEvent } from '../../actions';

export default async function EditEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; imported?: string }> }) {
  const id = Number((await params).id);
  const { saved, imported } = await searchParams;
  const e = await getEventById(id);
  if (!e) notFound();
  const [spots, cats, fd, shapes] = await Promise.all([eventSpots(e.id), eventCategories(e.id, e.genre_id), formData(e.id), eventShapes(e.id)]);
  return (
    <>
      <div className="section-head">
        <h1 style={{ fontSize: 19, margin: 0 }}>{e.name}</h1>
        <Link href={`/events/${e.slug}`} target="_blank">公開ページ ↗</Link>
      </div>
      {saved && <div className="flash">保存しました</div>}
      {imported && <div className="flash">下書きを取り込みました。マップの位置を確認・調整し、内容に問題がなければ下の「公開する」にチェックして保存してください。</div>}
      {!e.published && <div className="banner postponed">🔒 このイベントは<strong>非公開</strong>です（一般の人には表示されません）</div>}
      <MapEditor eventId={e.id} canvas={{ w: e.map_w, h: e.map_h }} spots={spots} shapes={shapes} categories={cats} />
      <h2 style={{ fontSize: 17, marginTop: 24 }}>イベント情報の編集</h2>
      <EventForm event={e} {...fd} />
      <form action={deleteEvent} className="panel">
        <input type="hidden" name="id" value={e.id} />
        <h2>イベントの削除</h2>
        <p className="muted small">地点・投稿もすべて削除されます。開催中止の場合は削除せず「開催状況」を中止にしてください。</p>
        <button className="btn danger sm">このイベントを削除</button>
      </form>
    </>
  );
}
