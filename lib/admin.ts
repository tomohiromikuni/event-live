import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

/**
 * 簡易管理者認証（プロトタイプ用）。
 * 本番では管理者アカウント（Supabase Auth / Auth.js 等）＋権限管理に置き換える。
 */
const COOKIE = 'evl_admin';
const TTL_MS = 12 * 3600_000;

/** 本番環境では ADMIN_PASSWORD が未設定だと管理画面にログインできない（初期パスワードでの公開を防ぐ） */
export function adminPassword(): string | null {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  return process.env.NODE_ENV === 'production' && process.env.VERCEL ? null : 'admin';
}
function secret() {
  return process.env.ADMIN_SECRET || 'dev-secret:' + (adminPassword() ?? '');
}
function sign(exp: number) {
  return createHmac('sha256', secret()).update(`admin:${exp}`).digest('hex');
}

export async function isAdmin(): Promise<boolean> {
  if (adminPassword() === null) return false;
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const [expStr, sig] = v.split('.');
  const exp = Number(expStr);
  if (!exp || exp < Date.now() || !sig) return false;
  const expected = Buffer.from(sign(exp));
  const got = Buffer.from(sig);
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export async function requireAdmin() {
  if (!(await isAdmin())) redirect('/admin-login');
}

export async function startSession() {
  const exp = Date.now() + TTL_MS;
  (await cookies()).set(COOKIE, `${exp}.${sign(exp)}`, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: TTL_MS / 1000, secure: process.env.NODE_ENV === 'production' });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}
