'use server';
import 'server-only';
import { one, q } from '@/lib/db';
import { ipHash } from '@/lib/posting';
import { redirectedSlug } from '@/lib/queries';
import { CONTACT_TOPICS, KIND_LABEL, RELATIONS, REMOVAL_REASONS } from '@/lib/inquiry';
import { SITE_NAME, siteUrl } from '@/lib/site';

export type ContactResult = { ok: boolean; message: string };

const s = (f: FormData, k: string, max: number) => String(f.get(k) ?? '').trim().slice(0, max);

/**
 * 掲載停止の申請・問い合わせを受け付ける。
 * 1) データベースに保存（管理画面「問い合わせ」で確認できる）
 * 2) 環境変数 CONTACT_EMAIL 宛にメールで通知（RESEND_API_KEY が設定されている場合）
 * 送信先のアドレスはコードに書かない（公開リポジトリのため）。
 */
export async function submitInquiry(_prev: ContactResult | null, f: FormData): Promise<ContactResult> {
  // 迷惑投稿対策: 人には見えない入力欄に値が入っていたらボットとみなす
  if (s(f, 'website', 10)) return { ok: true, message: '送信しました' };
  const kind = s(f, 'kind', 20) === 'removal' ? 'removal' : 'contact';
  const reason = s(f, 'reason', 60);
  const relation = s(f, 'relation', 40);
  const message = s(f, 'message', 3000);
  const name = s(f, 'name', 60);
  const email = s(f, 'email', 120);
  // イベントは ?event=（ページから来た場合）か、入力されたページのURL（/events/○○）から特定する
  const urlSlug = s(f, 'event_url', 300).match(/\/events\/([a-z0-9-]+)/i)?.[1] ?? '';
  const slug = s(f, 'event', 120) || urlSlug;

  if (kind === 'removal' && !(REMOVAL_REASONS as readonly string[]).includes(reason)) return { ok: false, message: '理由を選択してください' };
  if (kind === 'contact' && !(CONTACT_TOPICS as readonly string[]).includes(reason)) return { ok: false, message: 'お問い合わせの種類を選択してください' };
  if (relation && !(RELATIONS as readonly string[]).includes(relation)) return { ok: false, message: 'ご関係を選択し直してください' };
  if (kind === 'contact' && !message) return { ok: false, message: 'お問い合わせ内容を入力してください' };
  if (kind === 'removal' && reason === 'その他' && !message) return { ok: false, message: '「その他」の場合は理由を入力してください' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: '返信先のメールアドレスを正しく入力してください' };

  const to = slug ? await redirectedSlug(slug) : null; // URLを変えたイベントの古いURLでも分かるように
  const ev = slug ? await one<{ id: number; name: string }>('SELECT id, name FROM events WHERE slug = $1', [to ?? slug]) : undefined;
  if (kind === 'removal' && !ev) return { ok: false, message: '対象のイベントが見つかりません。イベントのページのURLを確認するか、イベントページの「掲載停止を申請する」から開き直してください' };

  const iph = await ipHash();
  const since = Date.now() - 3600_000;
  const recent = await one<{ n: number }>('SELECT COUNT(*)::int AS n FROM inquiries WHERE ip_hash = $1 AND created_at >= $2', [iph, since]);
  if ((recent?.n ?? 0) >= 5) return { ok: false, message: '短時間の送信が多すぎます。時間をおいてお試しください' };

  const row = await one<{ id: number }>(`INSERT INTO inquiries (kind, event_id, event_name, reason, relation, message, name, email, ip_hash, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [kind, ev?.id ?? null, ev?.name ?? '', reason, relation, message, name, email, iph, Date.now()]);

  const sent = await notifyByMail({ id: row!.id, kind, eventName: ev?.name ?? '', slug, reason, relation, message, name, email });
  if (sent.ok) await q('UPDATE inquiries SET mail_sent = 1 WHERE id = $1', [row!.id]);
  else if (sent.error) await q('UPDATE inquiries SET mail_error = $1 WHERE id = $2', [sent.error.slice(0, 300), row!.id]);

  return {
    ok: true,
    message: kind === 'removal'
      ? '掲載停止の申請を受け付けました。内容を確認のうえ、ご入力のメールアドレスにご連絡します。'
      : 'お問い合わせを受け付けました。内容を確認のうえ、必要に応じてご連絡します。',
  };
}

/** 運営宛のメール通知（Resend の API を使用）。未設定・失敗時は false（データは保存済みなので管理画面で確認できる） */
async function notifyByMail(d: { id: number; kind: string; eventName: string; slug: string; reason: string; relation: string; message: string; name: string; email: string }) {
  const to = process.env.CONTACT_EMAIL, key = process.env.RESEND_API_KEY;
  if (!to || !key) return { ok: false, error: '' };
  const from = process.env.CONTACT_FROM || `${SITE_NAME} <onboarding@resend.dev>`;
  const base = siteUrl();
  const lines = [
    `【${KIND_LABEL[d.kind]}】${SITE_NAME} に新しい${KIND_LABEL[d.kind]}が届きました。`,
    '',
    d.eventName ? `対象イベント: ${d.eventName}\n${base}/events/${d.slug}` : null,
    `${d.kind === 'removal' ? '理由' : '種類'}: ${d.reason}`,
    d.relation ? `ご関係: ${d.relation}` : null,
    `お名前: ${d.name || '（未入力）'}`,
    `返信先: ${d.email}`,
    '',
    '内容:',
    d.message || '（なし）',
    '',
    `管理画面: ${base}/admin/inquiries`,
  ].filter((l) => l !== null).join('\n');
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to], reply_to: d.email,
        subject: `【${SITE_NAME}】${KIND_LABEL[d.kind]}${d.eventName ? `：${d.eventName}` : ''}（#${d.id}）`,
        text: lines,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return { ok: true, error: '' };
    // 送れなかった理由（送信元のドメインが未認証、テスト用の送信元から登録外のアドレスへ送った、など）を残す
    const body = (await res.json().catch(() => null)) as { message?: string; name?: string } | null;
    const error = `${res.status} ${body?.message || body?.name || ''}`.trim();
    console.error('[contact] Resend error:', error);
    return { ok: false, error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
