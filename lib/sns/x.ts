import 'server-only';
import crypto from 'node:crypto';

/**
 * X（旧Twitter）への投稿。X API v2 の POST /2/tweets を OAuth 1.0a（ユーザーとしての投稿）で呼ぶ。
 * 認証情報は Vercel の環境変数だけに置く（コード・画面には出さない）：
 *   X_API_KEY / X_API_SECRET（アプリの API Key と Secret）、X_ACCESS_TOKEN / X_ACCESS_SECRET（投稿するアカウントの Access Token と Secret）
 * ほかのSNSを足すときは、同じ形（post(text) → { id, url }）のファイルを lib/sns/ に追加する。
 */
const ENDPOINT = 'https://api.x.com/2/tweets';

export function xReady() {
  return !!(process.env.X_API_KEY && process.env.X_API_SECRET && process.env.X_ACCESS_TOKEN && process.env.X_ACCESS_SECRET);
}

const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/** OAuth 1.0a の署名（HMAC-SHA1）。params には署名に含める全パラメータ（oauth_* とクエリ）を渡す */
export function oauthSignature(method: string, url: string, params: Record<string, string>, consumerSecret: string, tokenSecret: string) {
  const paramStr = Object.keys(params).map((k) => [enc(k), enc(params[k])]).sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`).join('&');
  const base = [method.toUpperCase(), enc(url), enc(paramStr)].join('&');
  return crypto.createHmac('sha1', `${enc(consumerSecret)}&${enc(tokenSecret)}`).update(base).digest('base64');
}

/** OAuth 1.0a の Authorization ヘッダー（JSON本文は署名に含めない） */
function oauthHeader(method: string, url: string) {
  const params: Record<string, string> = {
    oauth_consumer_key: process.env.X_API_KEY!,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: process.env.X_ACCESS_TOKEN!,
    oauth_version: '1.0',
  };
  params.oauth_signature = oauthSignature(method, url, params, process.env.X_API_SECRET!, process.env.X_ACCESS_SECRET!);
  return 'OAuth ' + Object.keys(params).sort().map((k) => `${enc(k)}="${enc(params[k])}"`).join(', ');
}

export class XError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** 投稿する。成功すると投稿のIDとURLを返す。失敗したら理由が分かる日本語のメッセージで XError を投げる */
export async function postToX(text: string): Promise<{ id: string; url: string }> {
  if (!xReady()) throw new XError('X の認証情報（X_API_KEY など）が未設定です。Vercel の環境変数に設定してください', 0);
  const url = process.env.X_API_BASE ? `${process.env.X_API_BASE}/2/tweets` : ENDPOINT; // X_API_BASE はテスト用
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: oauthHeader('POST', ENDPOINT), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new XError('X に接続できませんでした（時間をおいて再試行してください）', 0);
  }
  const body = (await res.json().catch(() => null)) as { data?: { id: string }; detail?: string; title?: string; errors?: { message: string }[] } | null;
  if (res.ok && body?.data?.id) return { id: body.data.id, url: `https://x.com/i/web/status/${body.data.id}` };
  const detail = body?.detail || body?.errors?.[0]?.message || body?.title || '';
  const reason = res.status === 401 ? '認証エラー（APIキー・アクセストークンを確認してください）'
    : res.status === 402 ? 'X API のクレジット（利用料金）が不足しています'
    : res.status === 403 ? (/duplicate/i.test(detail) ? '同じ内容の投稿がすでにあります' : '投稿が拒否されました（アプリの権限が Read and Write か確認してください）')
    : res.status === 429 ? 'X API の利用上限に達しました（時間をおいて再試行してください）'
    : `投稿に失敗しました（${res.status}）`;
  throw new XError(`${reason}${detail ? `：${detail}` : ''}`.slice(0, 300), res.status);
}
