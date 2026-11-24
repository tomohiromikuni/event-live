import EventForm from '@/components/admin/EventForm';
import { formData } from '@/lib/admin-data';

export default function NewEvent() {
  return (
    <>
      <h1 style={{ fontSize: 19 }}>イベントを新規登録</h1>
      <p className="muted small">登録すると専用ページと会場マップが自動で作成されます。地点は保存後に追加できます。</p>
      <EventForm {...formData()} />
    </>
  );
}
