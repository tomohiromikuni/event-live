import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { seed } from './seed';

/**
 * データベース接続（プロトタイプは SQLite）。
 * スキーマは PostgreSQL へ移行しやすいよう、標準的な型とリレーションのみを使う。
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🎉',
  color TEXT NOT NULL DEFAULT '#6366f1',
  info_fields TEXT NOT NULL DEFAULT '',   -- 詳細ページに表示する基本情報項目（カンマ区切り・表示順）
  sort INTEGER NOT NULL DEFAULT 0
);

-- 投稿の選択肢セット（待ち時間、駐車場、混雑度…）
CREATE TABLE IF NOT EXISTS report_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  options TEXT NOT NULL                   -- JSON: [{value,label,level}] level 0=良好〜3=非常に悪い, 4=利用不可
);

-- マップ地点のカテゴリ（トイレ、屋台、駐車場…）
CREATE TABLE IF NOT EXISTS spot_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  genre_id INTEGER NOT NULL REFERENCES genres(id),
  prefecture TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  venue_name TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
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
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES spot_categories(id),
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_spots_event ON spots(event_id);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  spot_id INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  label TEXT NOT NULL,                    -- 投稿時点の表示名（選択肢変更後も履歴が壊れないよう保存）
  level INTEGER NOT NULL,
  client_id TEXT NOT NULL,                -- ブラウザ単位の匿名ID
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,            -- 投稿時刻（UNIXミリ秒）
  hidden INTEGER NOT NULL DEFAULT 0,
  flag_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reports_event_time ON reports(event_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_spot_time ON reports(spot_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reports_client_time ON reports(client_id, created_at);

CREATE TABLE IF NOT EXISTS report_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  UNIQUE (report_id, client_id)
);
`;

const g = globalThis as unknown as { __db?: DatabaseSync };

export function db(): DatabaseSync {
  if (g.__db) return g.__db;
  const dir = path.join(process.cwd(), 'data');
  mkdirSync(dir, { recursive: true });
  const conn = new DatabaseSync(path.join(dir, 'app.db'));
  // node:sqlite は null プロトタイプのオブジェクトを返すため、React のシリアライズ用に通常のオブジェクトへ変換する
  const rawPrepare = conn.prepare.bind(conn);
  conn.prepare = ((sql: string) => {
    const st = rawPrepare(sql);
    const all = st.all.bind(st), get = st.get.bind(st);
    st.all = ((...a: never[]) => all(...a).map((r) => ({ ...r }))) as typeof st.all;
    st.get = ((...a: never[]) => { const r = get(...a); return r ? { ...r } : r; }) as typeof st.get;
    return st;
  }) as typeof conn.prepare;
  conn.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  conn.exec(SCHEMA);
  const { n } = conn.prepare('SELECT COUNT(*) AS n FROM genres').get() as { n: number };
  if (n === 0) seed(conn);
  g.__db = conn;
  return conn;
}

export function tx<T>(fn: (d: DatabaseSync) => T): T {
  const d = db();
  d.exec('BEGIN');
  try {
    const r = fn(d);
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}
