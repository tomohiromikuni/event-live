'use client';
import { startTransition, useActionState, useState } from 'react';
import { submitInquiry, type ContactResult } from '@/app/(site)/contact/actions';
import { CONTACT_TOPICS, RELATIONS, REMOVAL_REASONS } from '@/lib/inquiry';

type Props = { kind: 'removal' | 'contact'; event?: { slug: string; name: string } };

export default function ContactForm({ kind, event }: Props) {
  const [res, action, pending] = useActionState<ContactResult | null, FormData>(submitInquiry, null);
  const [reason, setReason] = useState('');
  const options = kind === 'removal' ? REMOVAL_REASONS : CONTACT_TOPICS;

  if (res?.ok) return <div className="flash" role="status">✅ {res.message}</div>;

  return (
    // onSubmit で送る（action={...} だと送信後に入力欄が空に戻り、エラー時に書いた内容が消えるため）
    <form className="form-grid" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); startTransition(() => action(fd)); }}>
      <input type="hidden" name="kind" value={kind} />
      {event && <input type="hidden" name="event" value={event.slug} />}
      {/* 迷惑投稿対策（人には見えない欄） */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden style={{ position: 'absolute', left: -9999, width: 1, height: 1 }} />

      {event ? (
        <div className="field">
          <label>対象のイベント</label>
          <div style={{ fontWeight: 700 }}>{event.name}</div>
        </div>
      ) : kind === 'removal' ? (
        <div className="field">
          <label htmlFor="event_url">対象のイベントのページのURL *</label>
          <input id="event_url" name="event_url" type="url" required maxLength={300} placeholder="https://www.evenow.jp/events/…" />
          <div className="muted small" style={{ marginTop: 4 }}>イベントのページを開き、アドレス欄のURLをコピーして貼り付けてください</div>
        </div>
      ) : null}

      <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>
          {kind === 'removal' ? '掲載停止を希望する理由 *' : 'お問い合わせの種類 *'}
        </legend>
        <div style={{ display: 'grid', gap: 6 }}>
          {options.map((o) => (
            <label key={o} className="choice">
              <input type="radio" name="reason" value={o} required checked={reason === o} onChange={() => setReason(o)} /> {o}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="relation">このイベントとのご関係{kind === 'removal' ? ' *' : '（任意）'}</label>
        <select id="relation" name="relation" required={kind === 'removal'} defaultValue="">
          <option value="" disabled={kind === 'removal'}>{kind === 'removal' ? '選択してください' : '選択しない'}</option>
          {RELATIONS.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>

      <div className="field">
        <label htmlFor="message">
          {kind === 'removal' ? `詳しい理由・ご要望${reason === 'その他' ? ' *' : '（任意）'}` : 'お問い合わせ内容 *'}
        </label>
        <textarea id="message" name="message" rows={6} maxLength={3000} required={kind === 'contact' || reason === 'その他'}
          placeholder={kind === 'removal' ? '例：主催者として、公式サイト以外での会場マップの掲載を控えたいため' : 'できるだけ具体的にご記入ください'} />
      </div>

      <div className="two">
        <div className="field"><label htmlFor="name">お名前・団体名（任意）</label><input id="name" name="name" maxLength={60} autoComplete="name" /></div>
        <div className="field"><label htmlFor="email">返信先メールアドレス *</label><input id="email" name="email" type="email" required maxLength={120} autoComplete="email" /></div>
      </div>

      <p className="muted small" style={{ margin: 0 }}>
        ご入力の内容は、このお問い合わせへの対応のためにのみ使用します。
        {kind === 'removal' && ' 確認のため、ご本人・ご関係を確認させていただく場合があります。'}
      </p>
      {res && !res.ok && <div role="alert" style={{ color: 'var(--danger)', fontWeight: 700 }}>⚠️ {res.message}</div>}
      <button className="btn" disabled={pending}>{pending ? '送信中…' : kind === 'removal' ? '掲載停止を申請する' : '送信する'}</button>
    </form>
  );
}
