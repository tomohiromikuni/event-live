'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cancelDraft, generateDrafts, postDraft, saveDraftText } from '@/app/admin/sns-actions';
import { X_LIMIT, xLength } from '@/lib/share';

/** 下書き1件：本文の修正・投稿・取り消し（文字数はXの数え方で表示） */
export function SnsDraft({ id, text, failed, ready }: { id: number; text: string; failed?: string; ready: boolean }) {
  const [value, setValue] = useState(text);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(failed ? { text: failed, error: true } : null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const len = xLength(value);
  const dirty = value !== text;
  const run = (fn: () => Promise<string | null | void>, ok: string) => start(async () => {
    const err = await fn();
    setMsg(err ? { text: err, error: true } : { text: ok });
    router.refresh();
  });
  return (
    <div>
      <textarea className="input" value={value} onChange={(e) => setValue(e.target.value)} rows={Math.min(12, value.split('\n').length + 1)}
        style={{ width: '100%', fontFamily: 'inherit', fontSize: 14 }} aria-label="投稿文" />
      <div className="small" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
        <span style={{ color: len > X_LIMIT ? '#dc2626' : undefined }}>{len} / {X_LIMIT}</span>
        {dirty && <button className="btn sm ghost" disabled={pending} onClick={() => run(() => saveDraftText(id, value), '保存しました')}>修正を保存</button>}
        <button className="btn sm" disabled={pending || dirty || len > X_LIMIT || !ready}
          title={!ready ? 'X の認証情報が未設定です' : dirty ? '先に修正を保存してください' : ''}
          onClick={() => { if (confirm('この内容で X に投稿します。よろしいですか？')) run(() => postDraft(id), '投稿しました'); }}>
          {failed ? '再試行' : 'X に投稿する'}
        </button>
        <button className="btn sm ghost" disabled={pending} onClick={() => run(() => cancelDraft(id), '取り消しました')}>取り消す</button>
        {msg && <span style={{ color: msg.error ? '#dc2626' : '#15803d', fontWeight: 700 }}>{msg.text}</span>}
      </div>
    </div>
  );
}

export function GenerateButton() {
  const [msg, setMsg] = useState('');
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn sm" disabled={pending} onClick={() => start(async () => { setMsg(await generateDrafts()); router.refresh(); })}>
        {pending ? '作成中…' : 'いまの状況から下書きを作る'}
      </button>
      {msg && <span className="small">{msg}</span>}
    </span>
  );
}
