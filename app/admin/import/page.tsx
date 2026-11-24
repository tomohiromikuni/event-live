import ImportForm from '@/components/admin/ImportForm';
import { q } from '@/lib/db';

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ event?: string; mymap?: string }> }) {
  const { event, mymap } = await searchParams;
  const events = await q<{ id: number; name: string }>('SELECT id, name FROM events ORDER BY start_date DESC LIMIT 200');
  return (
    <>
      <h1 style={{ fontSize: 19 }}>下書きを貼り付けて登録</h1>
      <p className="muted small">
        ガイドマップや公式サイトの情報から作った下書き（イベント情報・施設・エリア・線）を貼り付けると、まとめて登録できます。
        新しいイベントは<strong>非公開</strong>で作られるので、内容とマップの位置を確認・調整してから「公開する」にチェックしてください。
      </p>
      <div className="panel"><ImportForm events={events} defaultMode={event && /^\d+$/.test(event) ? event : 'new'} defaultMapUrl={mymap && /^https:\/\/(www\.)?google\./.test(mymap) ? mymap : ''} /></div>
    </>
  );
}
