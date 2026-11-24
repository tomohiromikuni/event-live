'use client';
import { useActionState } from 'react';
import { login } from '../admin/actions';

export default function AdminLogin() {
  const [err, action, pending] = useActionState(login, null);
  return (
    <div className="container" style={{ maxWidth: 380, paddingTop: 40 }}>
      <h1 style={{ fontSize: 20 }}>管理画面ログイン</h1>
      <form action={action} className="form-grid">
        <div className="field"><label htmlFor="pw">パスワード</label><input id="pw" name="password" type="password" required autoFocus /></div>
        {err && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{err}</div>}
        <button className="btn" disabled={pending}>ログイン</button>
        <p className="muted small">開発環境の初期パスワードは <code>admin</code>（環境変数 ADMIN_PASSWORD で変更）</p>
      </form>
    </div>
  );
}
