import Link from 'next/link';
import { notFound } from 'next/navigation';
import EventForm from '@/components/admin/EventForm';
import SpotEditor from '@/components/admin/SpotEditor';
import { formData } from '@/lib/admin-data';
import { eventCategories, eventSpots, getEventById } from '@/lib/queries';
import { deleteEvent } from '../../actions';

export default async function EditEvent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const id = Number((await params).id);
  const { saved } = await searchParams;
  const e = getEventById(id);
  if (!e) notFound();
  return (
    <>
      <div className="section-head">
        <h1 style={{ fontSize: 19, margin: 0 }}>{e.name}</h1>
        <Link href={`/events/${e.slug}`} target="_blank">公開ページ ↗</Link>
      </div>
      {saved && <div className="flash">保存しました</div>}
      <SpotEditor eventId={e.id} center={[e.lat, e.lng]} zoom={e.zoom} spots={eventSpots(e.id)} categories={eventCategories(e.id, e.genre_id)} />
      <h2 style={{ fontSize: 17, marginTop: 24 }}>イベント情報の編集</h2>
      <EventForm event={e} {...formData(e.id)} />
      <form action={deleteEvent} className="panel">
        <input type="hidden" name="id" value={e.id} />
        <h2>イベントの削除</h2>
        <p className="muted small">地点・投稿もすべて削除されます。開催中止の場合は削除せず「開催状況」を中止にしてください。</p>
        <button className="btn danger sm">このイベントを削除</button>
      </form>
    </>
  );
}
