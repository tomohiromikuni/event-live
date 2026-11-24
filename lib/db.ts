import 'server-only';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { seed } from './seed';
import { convertEventToCanvas } from './canvas';

/**
 * データベース接続（PostgreSQL）。
 *  - DATABASE_URL（または POSTGRES_URL）があれば実際の PostgreSQL（Neon / Supabase 等）に接続
 *  - 無ければ組込み PostgreSQL（PGlite）を ./data/pgdata に作成して使う（ローカル開発用・設定不要）
 * 初回接続時にスキーマ作成とサンプルデータ投入を自動で行う。
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS genres (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🎉',
  color TEXT NOT NULL DEFAULT '#6366f1',
  info_fields TEXT NOT NULL DEFAULT '',   -- 詳細ページに表示する基本情報項目（カンマ区切り・表示順）
  sort INTEGER NOT NULL DEFAULT 0
);

-- 投稿の選択肢セット（待ち時間、駐車場、混雑度…）
CREATE TABLE IF NOT EXISTS report_types (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  options TEXT NOT NULL                   -- JSON: [{value,label,level}] level 0=良好〜3=非常に悪い, 4=利用不可
);

-- マップ地点のカテゴリ（トイレ、屋台、駐車場…）
CREATE TABLE IF NOT EXISTS spot_categories (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📍',
  color TEXT NOT NULL DEFAULT '#64748b',
  report_type_id INTEGER REFERENCES report_types(id) ON DELETE SET NULL, -- NULL = 投稿対象外（救護所など）
  sort INTEGER NOT NULL DEFAULT 0
);

-- ジャンルごとの既定マップカテゴリ
CREATE TABLE IF NOT EXISTS genre_categories (
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES spot_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (genre_id, category_id)
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  genre_id INTEGER NOT NULL REFERENCES genres(id),
  prefecture TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  venue_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  zoom INTEGER NOT NULL DEFAULT 16,
  start_date TEXT NOT NULL,               -- YYYY-MM-DD（日本時間）
  end_date TEXT NOT NULL,
  time_text TEXT NOT NULL DEFAULT '',     -- 例: 18:00〜20:30
  summary TEXT NOT NULL DEFAULT '',
  organizer TEXT NOT NULL DEFAULT '',
  official_url TEXT NOT NULL DEFAULT '',
  access TEXT NOT NULL DEFAULT '',
  nearest_station TEXT NOT NULL DEFAULT '',
  traffic_info TEXT NOT NULL DEFAULT '',
  parking_info TEXT NOT NULL DEFAULT '',
  ticket_info TEXT NOT NULL DEFAULT '',
  extra_info TEXT NOT NULL DEFAULT '',    -- ジャンル固有の追加項目 "項目名: 値" を1行ずつ
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled / canceled / postponed
  status_note TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  image_credit TEXT NOT NULL DEFAULT '',
  is_sample INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  published INTEGER NOT NULL DEFAULT 1,
  source_url TEXT NOT NULL DEFAULT '',
  source_checked_at TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_events_pref ON events(prefecture);
CREATE INDEX IF NOT EXISTS idx_events_genre ON events(genre_id);

-- イベント個別のカテゴリ上書き（行が無ければジャンル既定を使う）
CREATE TABLE IF NOT EXISTS event_categories (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES spot_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, category_id)
);

CREATE TABLE IF NOT EXISTS spots (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES spot_categories(id),
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_spots_event ON spots(event_id);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  spot_id INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  label TEXT NOT NULL,                    -- 投稿時点の表示名（選択肢変更後も履歴が壊れないよう保存）
  level INTEGER NOT NULL,
  client_id TEXT NOT NULL,                -- ブラウザ単位の匿名ID
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,             -- 投稿時刻（UNIXミリ秒）
  hidden INTEGER NOT NULL DEFAULT 0,
  flag_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reports_event_time ON reports(event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_spot_time ON reports(spot_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_client_time ON reports(client_id, created_at);

CREATE TABLE IF NOT EXISTS report_flags (
  id SERIAL PRIMARY KEY,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  UNIQUE (report_id, client_id)
);
`;

/** v2: 簡易マップ（エリア・線の作図）と背景地図の表示方法 */
const V2 = `
ALTER TABLE events ADD COLUMN IF NOT EXISTS map_style TEXT NOT NULL DEFAULT 'light';
CREATE TABLE IF NOT EXISTS map_shapes (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                     -- area（エリア）/ line（線）
  style TEXT NOT NULL,                    -- lib/shapes.ts の種類（観覧エリア・通路など）
  label TEXT NOT NULL DEFAULT '',
  coords TEXT NOT NULL,                   -- JSON: [[lat, lng], ...]
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_shapes_event ON map_shapes(event_id);
`;

/** マイグレーション一覧（index 0 = v1）。追加するときは末尾に足す */
/**
 * v3: 会場マップを「見取り図（キャンバス座標）」に変更。
 * 既存の施設・エリアの緯度経度を、イベントごとに見取り図の座標へ変換する。
 */
const V3 = async (q: Q) => {
  await q('ALTER TABLE events ADD COLUMN IF NOT EXISTS map_w INTEGER NOT NULL DEFAULT 1000');
  await q('ALTER TABLE events ADD COLUMN IF NOT EXISTS map_h INTEGER NOT NULL DEFAULT 700');
  await q('ALTER TABLE events ALTER COLUMN lat SET DEFAULT 0');
  await q('ALTER TABLE events ALTER COLUMN lng SET DEFAULT 0');
  for (const { id } of await q<{ id: number }>('SELECT id FROM events')) await convertEventToCanvas(q, id);
};

/** v4: 地図の種類。canvas = ガイドマップから描いた見取り図 ／ geo = 緯度経度（マイマップ等）＋国土地理院の地図を背景に表示 */
const V4 = `ALTER TABLE events ADD COLUMN IF NOT EXISTS map_mode TEXT NOT NULL DEFAULT 'canvas'`;

/** v5: 掲載停止の申請・運営への問い合わせ（メール通知に加えて保存し、管理画面で確認できるようにする） */
const V5 = `
CREATE TABLE IF NOT EXISTS inquiries (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,                     -- removal（掲載停止の申請）/ contact（問い合わせ）
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',        -- 掲載停止の理由（選択肢）
  relation TEXT NOT NULL DEFAULT '',      -- 申請者の立場（主催者など）
  message TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  mail_sent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',     -- new / done
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inquiries_created ON inquiries(created_at);
`;

/**
 * v6: ハッシュタグとSNS共有の記録。
 * share_events には「共有ボタンが押された」「共有リンクから来訪した」を自前で記録する
 * （SNS側の表示回数・反応数はAPIで取得できる範囲が限られるため、取れるものだけを持つ）。
 */
const V6 = `
ALTER TABLE events ADD COLUMN IF NOT EXISTS hashtags TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS share_events (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  action TEXT NOT NULL,                   -- click（共有ボタン）/ visit（共有リンクからの来訪）
  channel TEXT NOT NULL,                  -- x / line / copy / native ／ visit は ref の値
  context TEXT NOT NULL DEFAULT 'event',  -- event（イベント紹介）/ live（現地情報）
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_share_event_time ON share_events(event_id, created_at);
`;

/**
 * v7: 投稿の閲覧記録（貢献実績の「あなたの投稿は○回閲覧されています」用）。
 * 投稿が「現在の状況」として実際に表示されたときだけ、閲覧者ごとに30分に1回まで記録する（slot = 30分単位の時刻）。
 */
const V7 = `
CREATE TABLE IF NOT EXISTS report_views (
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  viewer TEXT NOT NULL,                   -- 閲覧者の匿名ID（なければIPのハッシュ）
  slot BIGINT NOT NULL,                   -- 30分単位の時間枠
  PRIMARY KEY (report_id, viewer, slot)
);
CREATE INDEX IF NOT EXISTS idx_reports_client ON reports(client_id);
`;

/**
 * v8: イベントページの閲覧数（管理画面のアナリティクス用）。
 * 1回の閲覧ごとに行を増やさず「イベント×日（日本時間）」の合計だけを持つ。
 * 見た人の数は、匿名ID（なければIPのハッシュ）で1日1回だけ数える。見分け用の行は数日で削除する。
 */
const V8 = `
CREATE TABLE IF NOT EXISTS event_views (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  day TEXT NOT NULL,                      -- YYYY-MM-DD（日本時間）
  views INTEGER NOT NULL DEFAULT 0,       -- 閲覧数
  visitors INTEGER NOT NULL DEFAULT 0,    -- 見た人の数（1日1回）
  PRIMARY KEY (event_id, day)
);
CREATE TABLE IF NOT EXISTS event_view_seen (
  event_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  viewer TEXT NOT NULL,
  PRIMARY KEY (event_id, day, viewer)
);
`;

/** v9: 毎年開催のイベントか（終了後もページを検索エンジンに残し、翌年は同じURLで復活させる） */
const V9 = `ALTER TABLE events ADD COLUMN IF NOT EXISTS recurring INTEGER NOT NULL DEFAULT 0`;

const MIGRATIONS: (string | ((q: Q) => Promise<void>))[] = [SCHEMA, V2, V3, V4, V5, V6, V7, V8, V9];

export type Param = string | number | null;
/** SQL を実行して行を返す（プレースホルダは $1, $2 …） */
export type Q = <T = Record<string, unknown>>(sql: string, params?: Param[]) => Promise<T[]>;

type Driver = { q: Q; tx: <T>(fn: (q: Q) => Promise<T>) => Promise<T> };

async function createDriver(): Promise<Driver> {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (url) {
    const pg = (await import('pg')).default;
    pg.types.setTypeParser(20, (v: string) => Number(v)); // BIGINT（ミリ秒時刻・COUNT）を number で扱う
    const pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 });
    const wrap = (c: { query: (s: string, p?: Param[]) => Promise<{ rows: unknown[] }> }): Q =>
      (async (sql: string, params: Param[] = []) => (await c.query(sql, params)).rows) as Q;
    return {
      q: wrap(pool),
      async tx(fn) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const r = await fn(wrap(client));
          await client.query('COMMIT');
          return r;
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      },
    };
  }
  const { PGlite, types } = await import('@electric-sql/pglite');
  const dir = path.join(process.cwd(), 'data', 'pgdata');
  mkdirSync(path.dirname(dir), { recursive: true }); // 新しく clone した環境では data/ が無いため作る
  const db = new PGlite(dir, { parsers: { [types.INT8]: (v: string) => Number(v) } });
  const wrap = (c: { query: (s: string, p?: Param[]) => Promise<{ rows: unknown[] }> }): Q =>
    (async (sql: string, params: Param[] = []) => (await c.query(sql, params)).rows) as Q;
  return { q: wrap(db), tx: (fn) => db.transaction((t) => fn(wrap(t))) };
}

const g = globalThis as unknown as { __driver?: Promise<Driver> };

function driver(): Promise<Driver> {
  g.__driver ??= (async () => {
    const d = await createDriver();
    // 複数インスタンスが同時に起動しても初期化が1回になるようロックを取る
    await d.tx(async (q) => {
      await q('SELECT pg_advisory_xact_lock(727274)');
      // スキーマのバージョン管理：未適用のマイグレーションだけを順に実行する（既存の本番DBも自動で更新される）
      await q('CREATE TABLE IF NOT EXISTS schema_meta (id INTEGER PRIMARY KEY, version INTEGER NOT NULL)');
      let version = (await q<{ version: number }>('SELECT version FROM schema_meta WHERE id = 1'))[0]?.version;
      if (version === undefined) {
        const exists = await q<{ t: string | null }>("SELECT to_regclass('public.genres')::text AS t");
        version = exists[0].t ? 1 : 0; // バージョン管理導入前に作られたDBは v1 とみなす
        await q('INSERT INTO schema_meta (id, version) VALUES (1, $1)', [version]);
      }
      for (let v = version; v < MIGRATIONS.length; v++) {
        const m = MIGRATIONS[v];
        if (typeof m === 'function') await m(q);
        else for (const stmt of m.split(';').map((s) => s.trim()).filter(Boolean)) await q(stmt);
        await q('UPDATE schema_meta SET version = $1 WHERE id = 1', [v + 1]);
      }
      const [{ n }] = await q<{ n: number }>('SELECT COUNT(*)::int AS n FROM genres');
      if (n === 0) await seed(q);
    });
    return d;
  })().catch((e) => {
    g.__driver = undefined;
    throw e;
  });
  return g.__driver;
}

export const q: Q = async (sql, params) => (await driver()).q(sql, params);

export async function one<T = Record<string, unknown>>(sql: string, params?: Param[]): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

export async function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  return (await driver()).tx(fn);
}
