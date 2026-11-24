'use client';
import { useActionState, useState } from 'react';
import { saveEvent } from '@/app/admin/actions';
import { PREFECTURES } from '@/lib/prefectures';
import type { Category, EventRow, Genre } from '@/lib/types';

type Props = {
  event?: EventRow;
  genres: Genre[];
  categories: Category[];
  genreDefaults: Record<number, number[]>;
  customCategoryIds: number[];
};

function F({ label, name, def, type = 'text', placeholder, required }: { label: string; name: string; def?: string | number; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}{required && ' *'}</label>
      <input id={name} name={name} type={type} defaultValue={def ?? ''} placeholder={placeholder} required={required} step={type === 'number' ? 'any' : undefined} />
    </div>
  );
}
function T({ label, name, def, placeholder }: { label: string; name: string; def?: string; placeholder?: string }) {
  return (
    <div className="field"><label htmlFor={name}>{label}</label><textarea id={name} name={name} defaultValue={def ?? ''} placeholder={placeholder} /></div>
  );
}

export default function EventForm({ event: e, genres, categories, genreDefaults, customCategoryIds }: Props) {
  const [err, action, pending] = useActionState(saveEvent, null);
  const [genreId, setGenreId] = useState<number>(e?.genre_id ?? genres[0]?.id);
  const [custom, setCustom] = useState(customCategoryIds.length > 0);
  const checked = custom ? customCategoryIds : genreDefaults[genreId] ?? [];

  return (
    <form action={action} className="form-grid">
      {e && <input type="hidden" name="id" value={e.id} />}
      <div className="panel" style={{ marginTop: 0 }}>
        <h2>基本情報</h2>
        <div className="form-grid">
          <F label="イベント名" name="name" def={e?.name} required />
          <div className="two">
            <div className="field">
              <label htmlFor="genre_id">ジャンル *</label>
              <select id="genre_id" name="genre_id" value={genreId} onChange={(ev) => setGenreId(Number(ev.target.value))}>
                {genres.map((g) => <option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
              </select>
            </div>
            <F label="URL用ID（空欄で自動）" name="slug" def={e?.slug} placeholder="例: minato-hanabi-2026" />
          </div>
          <div className="two">
            <F label="開始日" name="start_date" type="date" def={e?.start_date} required />
            <F label="終了日" name="end_date" type="date" def={e?.end_date} />
          </div>
          <F label="開催時間" name="time_text" def={e?.time_text} placeholder="例: 18:30〜20:00" />
          <T label="イベント概要" name="summary" def={e?.summary} />
          <div className="two">
            <div className="field">
              <label htmlFor="status">開催状況</label>
              <select id="status" name="status" defaultValue={e?.status ?? 'scheduled'}>
                <option value="scheduled">開催予定</option><option value="canceled">中止</option><option value="postponed">延期</option>
              </select>
            </div>
            <F label="開催状況の補足" name="status_note" def={e?.status_note} placeholder="中止・延期の理由など" />
          </div>
          <div className="check-grid">
            <label><input type="checkbox" name="published" defaultChecked={e ? !!e.published : true} /> 公開する</label>
            <label><input type="checkbox" name="is_featured" defaultChecked={!!e?.is_featured} /> 注目イベント</label>
            <label><input type="checkbox" name="is_sample" defaultChecked={e ? !!e.is_sample : false} /> サンプルデータ</label>
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>会場</h2>
        <div className="form-grid">
          <div className="two">
            <div className="field">
              <label htmlFor="prefecture">都道府県 *</label>
              <select id="prefecture" name="prefecture" defaultValue={e?.prefecture ?? ''} required>
                <option value="">選択</option>{PREFECTURES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <F label="市区町村" name="city" def={e?.city} />
          </div>
          <F label="会場名" name="venue_name" def={e?.venue_name} />
          <F label="住所" name="address" def={e?.address} />
          <div className="two">
            <F label="会場の緯度" name="lat" type="number" def={e?.lat} required />
            <F label="会場の経度" name="lng" type="number" def={e?.lng} required />
          </div>
          <F label="地図の初期ズーム（13〜18）" name="zoom" type="number" def={e?.zoom ?? 16} />
        </div>
      </div>

      <div className="panel">
        <h2>詳細情報（不明な項目は空欄 → 公開ページでは「情報なし」と表示）</h2>
        <div className="form-grid">
          <T label="アクセス方法" name="access" def={e?.access} />
          <F label="最寄り駅" name="nearest_station" def={e?.nearest_station} />
          <T label="交通規制" name="traffic_info" def={e?.traffic_info} />
          <T label="駐車場" name="parking_info" def={e?.parking_info} />
          <T label="入場料・チケット" name="ticket_info" def={e?.ticket_info} />
          <F label="主催者" name="organizer" def={e?.organizer} />
          <F label="公式サイトURL" name="official_url" type="url" def={e?.official_url} />
          <T label="ジャンル別の追加項目（「項目名: 値」を1行ずつ）" name="extra_info" def={e?.extra_info} placeholder={'打ち上げ数: 約1万発\n雨天時: 翌日に順延'} />
          <div className="two">
            <F label="画像URL（利用許諾済みのもののみ）" name="image_url" type="url" def={e?.image_url} />
            <F label="画像クレジット" name="image_credit" def={e?.image_credit} />
          </div>
          <div className="two">
            <F label="情報元URL" name="source_url" type="url" def={e?.source_url} />
            <F label="情報元の確認日" name="source_checked_at" type="date" def={e?.source_checked_at} />
          </div>
        </div>
      </div>

      <div className="panel">
        <h2>マップのカテゴリ・投稿項目</h2>
        <label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <input type="checkbox" name="custom_categories" checked={custom} onChange={(ev) => setCustom(ev.target.checked)} />
          このイベント独自のカテゴリを使う（オフ＝ジャンルの既定設定を使用）
        </label>
        <div className="check-grid" key={`${custom}-${genreId}`}>
          {categories.map((c) => (
            <label key={c.id} style={{ opacity: custom ? 1 : 0.55 }}>
              <input type="checkbox" name="categories" value={c.id} defaultChecked={checked.includes(c.id)} disabled={!custom} />
              {c.icon} {c.name}
            </label>
          ))}
        </div>
      </div>

      {err && <div style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠️ {err}</div>}
      <button className="btn" disabled={pending} style={{ position: 'sticky', bottom: 12 }}>{pending ? '保存中…' : '保存する'}</button>
    </form>
  );
}
