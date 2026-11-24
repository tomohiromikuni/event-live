import { db } from '@/lib/db';
import { listCategories, listGenres } from '@/lib/queries';
import { INFO_FIELDS } from '@/lib/prefectures';
import { saveCategory, saveGenre, saveReportType } from '../actions';
import type { ReportOption } from '@/lib/types';

type RT = { id: number; slug: string; name: string; options: string };
const inp = { height: 34, fontSize: 13 };

export default function Settings() {
  const genres = listGenres();
  const cats = listCategories();
  const rts = db().prepare('SELECT * FROM report_types ORDER BY id').all() as RT[];
  const gc = db().prepare('SELECT genre_id, category_id FROM genre_categories').all() as { genre_id: number; category_id: number }[];
  const has = (g: number, c: number) => gc.some((r) => r.genre_id === g && r.category_id === c);
  const rtText = (o: string) => (JSON.parse(o) as ReportOption[]).map((x) => `${x.value}|${x.label}|${x.level}`).join('\n');

  return (
    <>
      <h1 style={{ fontSize: 19 }}>ジャンル・カテゴリ設定</h1>
      <p className="muted small">
        ジャンルごとに「マップに表示するカテゴリ」と「詳細ページの基本情報項目」を設定できます。カテゴリには投稿の選択肢セットを割り当てます。
        イベント個別にカテゴリを変えたい場合はイベント編集画面で上書きできます。
      </p>

      <section className="panel">
        <h2>ジャンル</h2>
        <p className="muted small" style={{ marginTop: 0 }}>基本情報項目のキー: {INFO_FIELDS.map((f) => `${f.key}(${f.label})`).join(', ')}</p>
        {[...genres, null].map((g) => (
          <form key={g?.id ?? 'new'} action={saveGenre} style={{ borderTop: '1px solid var(--border)', padding: '10px 0', display: 'grid', gap: 6 }}>
            {g && <input type="hidden" name="id" value={g.id} />}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {!g && <input className="input" name="slug" placeholder="slug（英小文字）" required style={{ ...inp, width: 130 }} />}
              <input className="input" name="icon" defaultValue={g?.icon} placeholder="絵文字" style={{ ...inp, width: 56 }} />
              <input className="input" name="name" defaultValue={g?.name} placeholder={g ? '' : '新しいジャンル名'} required style={{ ...inp, width: 170 }} />
              <input type="color" name="color" defaultValue={g?.color ?? '#64748b'} style={{ height: 34, width: 44 }} />
              <input className="input" name="sort" type="number" defaultValue={g?.sort ?? 99} title="表示順" style={{ ...inp, width: 64 }} />
              <button className="btn sm">{g ? '保存' : '追加'}</button>
            </div>
            <input className="input" name="info_fields" defaultValue={g?.info_fields ?? INFO_FIELDS.map((f) => f.key).join(',')} title="基本情報項目（表示順）" style={inp} />
            <div className="check-grid">
              {cats.map((c) => (
                <label key={c.id}><input type="checkbox" name="categories" value={c.id} defaultChecked={g ? has(g.id, c.id) : false} />{c.icon} {c.name}</label>
              ))}
            </div>
          </form>
        ))}
      </section>

      <section className="panel">
        <h2>マップのカテゴリ</h2>
        {[...cats, null].map((c) => (
          <form key={c?.id ?? 'new'} action={saveCategory} style={{ display: 'flex', gap: 6, flexWrap: 'wrap', borderTop: '1px solid var(--border)', padding: '8px 0' }}>
            {c && <input type="hidden" name="id" value={c.id} />}
            {!c && <input className="input" name="slug" placeholder="slug" required style={{ ...inp, width: 100 }} />}
            <input className="input" name="icon" defaultValue={c?.icon} placeholder="絵文字" style={{ ...inp, width: 56 }} />
            <input className="input" name="name" defaultValue={c?.name} placeholder={c ? '' : '新しいカテゴリ名'} required style={{ ...inp, width: 150 }} />
            <input type="color" name="color" defaultValue={c?.color ?? '#64748b'} style={{ height: 34, width: 44 }} />
            <select className="input" name="report_type_id" defaultValue={c?.report_type_id ?? ''} style={{ ...inp, width: 170 }}>
              <option value="">投稿なし（位置のみ）</option>
              {rts.map((r) => <option key={r.id} value={r.id}>投稿: {r.name}</option>)}
            </select>
            <input className="input" name="sort" type="number" defaultValue={c?.sort ?? 99} title="表示順" style={{ ...inp, width: 64 }} />
            <button className="btn sm">{c ? '保存' : '追加'}</button>
          </form>
        ))}
      </section>

      <section className="panel">
        <h2>投稿の選択肢セット</h2>
        <p className="muted small" style={{ marginTop: 0 }}>1行に「値|表示名|レベル」。レベル: 0=良好(緑) 1=やや(黄) 2=混雑(橙) 3=非常に(赤) 4=利用不可(黒)</p>
        {[...rts, null].map((r) => (
          <form key={r?.id ?? 'new'} action={saveReportType} style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--border)', padding: '10px 0' }}>
            {r && <input type="hidden" name="id" value={r.id} />}
            <div style={{ display: 'flex', gap: 6 }}>
              {!r && <input className="input" name="slug" placeholder="slug" required style={{ ...inp, width: 100 }} />}
              <input className="input" name="name" defaultValue={r?.name} placeholder={r ? '' : '新しい選択肢セット名'} required style={{ ...inp, flex: 1 }} />
              <button className="btn sm">{r ? '保存' : '追加'}</button>
            </div>
            <textarea className="input" name="options" defaultValue={r ? rtText(r.options) : ''} rows={5} style={{ height: 'auto', fontSize: 13, padding: 8, fontFamily: 'monospace' }}
              placeholder={'none|待ち時間なし|0\n10min|10分程度|2'} />
          </form>
        ))}
      </section>
    </>
  );
}
