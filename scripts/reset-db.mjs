// DBファイルを削除する。次回起動時にスキーマ作成とサンプルデータ投入が自動で行われる。
import { rmSync } from 'node:fs';
for (const f of ['data/app.db', 'data/app.db-wal', 'data/app.db-shm']) rmSync(f, { force: true });
console.log('Database removed. Sample data will be re-seeded on next start.');
