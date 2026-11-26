import 'server-only';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { migrateCoarseOptions, migrateShuttle, seed } from './seed';
import { cleanInfoText } from './infoText';
import { enableSimpleMode } from './simple';
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

/**
 * v10: サイト内検索で使われた言葉（管理画面のアナリティクス用）。
 * 「日×言葉」の合計だけを持つ。zero_results は結果が0件だった回数（＝載っていないのに探されたイベント）。
 */
const V10 = `
CREATE TABLE IF NOT EXISTS search_queries (
  day TEXT NOT NULL,                      -- YYYY-MM-DD（日本時間）
  query TEXT NOT NULL,                    -- 正規化した検索語
  searches INTEGER NOT NULL DEFAULT 0,
  zero_results INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, query)
);
`;

/**
 * v11: 削除依頼（掲載停止の申請）の対応内容を残す。
 * resolution: unpublished（掲載を停止した）/ kept（掲載を続けた）/ ''（未対応・問い合わせ）
 */
const V11 = `
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS resolution TEXT NOT NULL DEFAULT '';
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS resolved_at BIGINT;
`;


/**
 * v12: 自動収集（第1段階）。情報源 → 取得したページ → AIで抽出した候補 → 管理者が確認して非公開イベントを作成。
 * docs/AUTOMATION_PLAN.md 参照。
 */
const V12 = `
CREATE TABLE IF NOT EXISTS sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                     -- rss（RSS/Atom）/ page（1ページ）
  url TEXT NOT NULL UNIQUE,
  prefecture TEXT NOT NULL DEFAULT '',
  trust TEXT NOT NULL DEFAULT 'other',    -- official（公式）/ public（自治体・観光協会）/ other
  terms_checked_at TEXT NOT NULL DEFAULT '', -- 利用規約を確認した日（未確認なら巡回しない）
  enabled INTEGER NOT NULL DEFAULT 0,
  interval_hours INTEGER NOT NULL DEFAULT 24,
  note TEXT NOT NULL DEFAULT '',
  last_fetched_at BIGINT NOT NULL DEFAULT 0,
  last_status TEXT NOT NULL DEFAULT '',
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS crawl_pages (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  text_hash TEXT NOT NULL DEFAULT '',     -- 前回と内容が同じならAIに送らない
  text TEXT NOT NULL DEFAULT '',
  links TEXT NOT NULL DEFAULT '[]',       -- ページ内の Google マイマップ等のリンク（JSON）
  status TEXT NOT NULL DEFAULT 'pending', -- pending（抽出待ち）/ done / failed / skipped
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  fetched_at BIGINT NOT NULL DEFAULT 0,
  extracted_at BIGINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_crawl_pages_status ON crawl_pages(status);
CREATE TABLE IF NOT EXISTS crawl_runs (
  id SERIAL PRIMARY KEY,
  trigger TEXT NOT NULL,                  -- cron / manual
  started_at BIGINT NOT NULL,
  finished_at BIGINT NOT NULL DEFAULT 0,
  fetched INTEGER NOT NULL DEFAULT 0,
  changed INTEGER NOT NULL DEFAULT 0,
  extracted INTEGER NOT NULL DEFAULT 0,
  new_candidates INTEGER NOT NULL DEFAULT 0,
  duplicates INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  log TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS event_candidates (
  id SERIAL PRIMARY KEY,
  page_id INTEGER REFERENCES crawl_pages(id) ON DELETE SET NULL,
  source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  fingerprint TEXT NOT NULL,              -- 正規化した名前＋都道府県＋開始日（重複判定用）
  data TEXT NOT NULL,                     -- 抽出結果（JSON）
  confidence INTEGER NOT NULL DEFAULT 0,  -- 0〜100
  status TEXT NOT NULL DEFAULT 'pending', -- pending（確認待ち）/ approved / rejected / merged
  match_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL, -- 同じと思われる既存イベント
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,       -- 承認して作成・更新したイベント
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON event_candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_fp ON event_candidates(fingerprint);
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * v13: 会場マップがないイベントの「かんたん表示」。
 * events.map_mode = 'simple' のとき、地図は出さず、自動で用意した項目（spots.generic = 1：駐車場（会場周辺）・トイレ など）の一覧で状況を共有する。
 */
const V13 = `ALTER TABLE spots ADD COLUMN IF NOT EXISTS generic INTEGER NOT NULL DEFAULT 0`;

/** v14: シャトルバス・トイレ・飲食エリアの公式情報欄（詳細ページの見出し「駐車場／シャトルバス／交通規制・周辺道路／トイレ／飲食エリア」用） */
const V14 = `
ALTER TABLE events ADD COLUMN IF NOT EXISTS shuttle_info TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS toilet_info TEXT NOT NULL DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS food_info TEXT NOT NULL DEFAULT ''
`;

/** v16: URL（スラッグ）を変えたときの転送先。古いURL → イベント（いまのURLへ 308 で転送）。共有済みのリンク・検索エンジンの評価を引き継ぐ */
const V16 = `
CREATE TABLE IF NOT EXISTS slug_redirects (
  old_slug TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
)
`;

/** v17: SNS投稿の下書き・履歴（最初は X のみ）。dedupe_key で同じ内容を二度作らない */
const V17 = `
CREATE TABLE IF NOT EXISTS sns_posts (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'x',
  kind TEXT NOT NULL,                     -- pre / today / live / status
  text TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft',   -- draft / posted / failed / canceled
  snapshot TEXT NOT NULL DEFAULT '',      -- 現地の投稿：使った投稿の内容・最新時刻・件数（JSON）
  external_id TEXT NOT NULL DEFAULT '',
  external_url TEXT NOT NULL DEFAULT '',
  error TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  posted_at BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sns_posts_status ON sns_posts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_sns_posts_event ON sns_posts(event_id, kind, created_at)
`;

/** v18: 施設の出どころ（'' = 手で登録・'osm' = OpenStreetMap から自動取得 など）と、元データのID（重複取り込みの防止） */
const V18 = `
ALTER TABLE spots ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT '';
ALTER TABLE spots ADD COLUMN IF NOT EXISTS ext_id TEXT NOT NULL DEFAULT ''
`;

/** v19: 問い合わせの通知メールが送れなかった理由（Resend の返したエラー）。管理画面で原因が分かるように */
const V19 = `ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS mail_error TEXT NOT NULL DEFAULT ''`;

/**
 * v20: 会場マップの自動作成を最後に試した時刻（同じイベントを毎日試さない）。
 * 自動収集（AIで探す・会場マップの自動作成）は、運営者の依頼により初期ON（まだ一度も切り替えていない場合だけ。OFFにしてあれば変えない）
 */
const V20 = `
ALTER TABLE events ADD COLUMN IF NOT EXISTS automap_at BIGINT NOT NULL DEFAULT 0;
INSERT INTO app_settings (key, value) VALUES ('collect_enabled', '1') ON CONFLICT (key) DO NOTHING
`;

/** v21: まとめ探し（月1回のバッチ検索）で見つけた公式ページの一覧。定期実行のたびに少しずつ取得する */
const V21 = `
CREATE TABLE IF NOT EXISTS sweep_queue (
  url TEXT PRIMARY KEY,
  pref TEXT NOT NULL DEFAULT '',
  theme TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',     -- new（取得待ち）/ queued（AI整理待ちへ）/ known（取得済み）/ blocked（robots.txt・取得失敗）
  found_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sweep_queue_status ON sweep_queue(status, found_at)
`;

/** v22: 自動公開（承認なしで公開したイベント）の印と、候補に自動公開しなかった理由のメモ */
const V22 = `
ALTER TABLE events ADD COLUMN IF NOT EXISTS auto_published INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_candidates ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT ''
`;

/** v23: AIの読み取り形式の不具合（union型の数の制限）で失敗したページを、読み取り待ちに戻す */
const V23 = `UPDATE crawl_pages SET status = 'pending', attempts = 0, error = '' WHERE error LIKE '%union types%'`;

/** v24: 自動公開したイベントで、会場マップの自動作成が外部サービスの混雑で失敗したものを、すぐ試し直せるようにする */
const V24 = `UPDATE events SET automap_at = 0 WHERE auto_published = 1 AND map_mode = 'simple'`;

/** v25: 自動公開したイベントで、載せられる情報（公式情報・トイレ等の場所）が何も無いものは非公開にする（運営者の方針） */
const V25 = `UPDATE events e SET published = 0 WHERE e.auto_published = 1
  AND e.parking_info = '' AND e.shuttle_info = '' AND e.toilet_info = '' AND e.food_info = '' AND e.traffic_info = ''
  AND NOT EXISTS (SELECT 1 FROM spots s JOIN spot_categories c ON c.id = s.category_id
    WHERE s.event_id = e.id AND s.generic = 0 AND c.slug IN ('toilet', 'parking', 'shuttle', 'food'))`;

/** 公式サイト内の地図探し（深掘り・サイト内検索）を入れたので、自動で作ったイベントで場所がまだ無いものをもう一度試す */
const V26 = `UPDATE events e SET automap_at = 0 WHERE e.auto_published = 1
  AND NOT EXISTS (SELECT 1 FROM spots s WHERE s.event_id = e.id AND s.generic = 0)`;

/** 画像の形式の判定・地図でない画像のときのサイト内検索を直したので、もう一度試す */
const V27 = V26;

/** OpenStreetMap につながらなかったイベント（1時間ごとにやり直す）。今の地図の無い実イベントは一度やり直す */
const V28 = `ALTER TABLE events ADD COLUMN IF NOT EXISTS osm_pending INTEGER NOT NULL DEFAULT 0;
UPDATE events e SET osm_pending = 1 WHERE e.is_sample = 0 AND e.map_mode = 'simple'
  AND NOT EXISTS (SELECT 1 FROM spots s WHERE s.event_id = e.id AND s.generic = 0)`;

const V29 = `ALTER TABLE events ADD COLUMN IF NOT EXISTS osm_tried_at BIGINT NOT NULL DEFAULT 0`;

/** 1.5km まで広げて探すようにしたので、トイレか駐車場が1つも無い実イベントをもう一度探す */
const V30 = `UPDATE events e SET osm_pending = 1, osm_tried_at = 0 WHERE e.is_sample = 0 AND e.map_mode = 'geo'
  AND (NOT EXISTS (SELECT 1 FROM spots s JOIN spot_categories c ON c.id = s.category_id WHERE s.event_id = e.id AND s.generic = 0 AND c.slug = 'toilet')
    OR NOT EXISTS (SELECT 1 FROM spots s JOIN spot_categories c ON c.id = s.category_id WHERE s.event_id = e.id AND s.generic = 0 AND c.slug = 'parking'))`;

/** 公式情報の補完（公式サイトのアクセス・駐車場などのページから）。公式情報が空の実イベントは会場マップの自動作成をやり直す（そのときに補完する） */
const V31 = `ALTER TABLE events ADD COLUMN IF NOT EXISTS enrich_at BIGINT NOT NULL DEFAULT 0;
UPDATE events SET automap_at = 0 WHERE is_sample = 0 AND (parking_info = '' OR toilet_info = '')`;

/**
 * 修復：①公式情報に入った「記載はありません」などの文を消す（未確認として表示する）
 * ②市区町村・住所が無いのに自動で位置を決めた地図（同じ名前の別の場所を拾っていた）を外し、地図なしの表示に戻して作り直す
 */
async function repairAutoData(q: Q) {
  const rows = await q<{ id: number; parking_info: string; shuttle_info: string; traffic_info: string; toilet_info: string }>(
    'SELECT id, parking_info, shuttle_info, traffic_info, toilet_info FROM events WHERE is_sample = 0');
  for (const r of rows) {
    for (const f of ['parking_info', 'shuttle_info', 'traffic_info', 'toilet_info'] as const) {
      const v = cleanInfoText(r[f]);
      if (v !== r[f]) await q(`UPDATE events SET ${f} = $1 WHERE id = $2`, [v, r.id]);
    }
  }
  const bad = await q<{ id: number }>(`SELECT e.id FROM events e WHERE e.is_sample = 0 AND e.map_mode = 'geo' AND e.city = '' AND e.address = ''
    AND EXISTS (SELECT 1 FROM spots s WHERE s.event_id = e.id AND s.source IN ('osm', 'guide'))
    AND NOT EXISTS (SELECT 1 FROM spots s WHERE s.event_id = e.id AND s.generic = 0 AND s.source NOT IN ('osm', 'guide'))`);
  for (const { id } of bad) {
    await q(`DELETE FROM spots s WHERE s.event_id = $1 AND s.source IN ('osm', 'guide') AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.spot_id = s.id)`, [id]);
    await q(`UPDATE events SET lat = 0, lng = 0, automap_at = 0, enrich_at = 0, osm_pending = 0 WHERE id = $1`, [id]);
    await enableSimpleMode(q, id);
  }
}

/** 会場の範囲を囲う機能を入れたので、地図のある実イベントの会場マップ自動作成をやり直す */
const V32 = `UPDATE events SET automap_at = 0 WHERE is_sample = 0 AND map_mode = 'geo'`;

/** 会場の範囲を公園・広場の抽出データから探せるようにしたので、もう一度やり直す */
const V33 = V32;

const V34 = V32;

/** 公式の仮設トイレ・臨時駐車場・乗り場を読み取った時刻（開催2週間前からは2日に1回） */
const V35 = `ALTER TABLE events ADD COLUMN IF NOT EXISTS temp_at BIGINT NOT NULL DEFAULT 0`;

/** 来場者の場所の報告（ピン）：報告した時刻・回線（ハッシュ）と、確認の票 */
const V36 = `ALTER TABLE spots ADD COLUMN IF NOT EXISTS created_at BIGINT NOT NULL DEFAULT 0;
ALTER TABLE spots ADD COLUMN IF NOT EXISTS ip_hash TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS pin_votes (
  spot_id INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  who TEXT NOT NULL,
  vote INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (spot_id, who)
);
CREATE INDEX IF NOT EXISTS idx_pin_votes_spot ON pin_votes(spot_id)`;

/** 駐車場・トイレの改善（会場の範囲の周りから探す・種類・規模・設備）を入れたので、地図のある実イベントをやり直す */
const V37 = `UPDATE events SET automap_at = 0 WHERE is_sample = 0 AND map_mode = 'geo'`;

/** 公式の案内の位置を地図データの名前から合わせる仕組みを入れたので、位置の無い案内があるイベントをやり直す */
const V38 = `UPDATE events e SET automap_at = 0 WHERE EXISTS (SELECT 1 FROM spots s WHERE s.event_id = e.id AND s.source = 'official_temp' AND s.generic = 1)`;

/** 英語版：イベントの中身の訳（lib/translate.ts） */
const V39 = `CREATE TABLE IF NOT EXISTS event_i18n (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  lang TEXT NOT NULL,
  data TEXT NOT NULL,
  src_hash TEXT NOT NULL DEFAULT '',
  updated_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, lang)
)`;

const MIGRATIONS: (string | ((q: Q) => Promise<void>))[] = [SCHEMA, V2, V3, V4, V5, V6, V7, V8, V9, V10, V11, V12, V13, V14, migrateShuttle, V16, V17, V18, V19, V20, V21, V22, V23, V24, V25, V26, V27, V28, V29, migrateCoarseOptions, V30, V31, repairAutoData, V32, V33, V34, V35, V36, V37, V38, V39];

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
