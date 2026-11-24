// ローカルの組込みDB（PGlite: data/pgdata）を削除する。次回起動時にスキーマ作成とサンプルデータ投入が自動で行われる。
// 本番DB（DATABASE_URL）には影響しない。本番のサンプル日程の更新は管理画面の「サンプルデータをリセット」から。
import { rmSync } from 'node:fs';
import path from 'node:path';

const target = path.join(process.cwd(), 'data', 'pgdata');
rmSync(target, { recursive: true, force: true });
console.log(`Removed ${target}. Sample data will be re-seeded on next start.`);
