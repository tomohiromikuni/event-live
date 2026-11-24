'use client';
import { useActionState } from 'react';
import { login } from '../admin/actions';

export default function AdminLogin() {
  const [err, action, pending] = useActionState(login, null);
  return (
    <div className="admin admin-login">
      <div className="panel">
      <h1>EVENOW 管理画面</h1>
      <form action={action} className="form-grid">
        <div className="field"><label htmlFor="pw">パスワード</label><input id="pw" name="password" type="password" required autoFocus /></div>
        {err && <div style={{ color: 'var(--danger)', fontSize: 14 }}>{err}</div>}
        <button className="btn" disabled={pending}>ログイン</button>
        {process.env.NODE_ENV !== 'production' && (
          <p className="muted small">開発環境の初期パスワードは <code>admin</code>（環境変数 ADMIN_PASSWORD で変更）</p>
        )}
      </form>
      </div>
    </div>
  );
}
