import 'server-only';
import { timingSafeEqual } from 'node:crypto';

/** 定期実行（GitHub Actions）からの呼び出しか：Authorization: Bearer <CRON_SECRET> */
export function cronAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return secret.length >= 16 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}
