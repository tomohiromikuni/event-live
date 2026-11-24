# EVENOW（イベナウ）設計書（MVP）

## 1. 企画の整理

| 観点 | 内容 |
|---|---|
| 価値 | 「行く前」＝全国イベントの検索・基本情報／「当日」＝会場マップ＋来場者のリアルタイム投稿 |
| 差別化 | 地点単位（トイレ①、臨時駐車場…）でワンタップ投稿し、鮮度つきで地図に反映（Waze型） |
| 前提 | 主催者と契約しない第三者サービス・無料・ログイン不要・スマホブラウザ最優先 |
| スケール | 数千〜数万イベントを共通DB＋共通テンプレートで生成（イベント別サイトは作らない） |

## 2. 機能一覧

| 区分 | 機能 | MVP |
|---|---|---|
| 探す | キーワード検索／今日・今週末・今後／ジャンル／都道府県／開催日／注目／盛り上がり中 | ✅ |
| 詳細 | 基本情報（取得できない項目は「情報なし」）・ジャンル別表示項目・開催状況（中止/延期）・情報元URLと確認日・サンプル表示 | ✅ |
| マップ | ベース地図＋独自デザインの地点マーカー、カテゴリ絞り込み、拡大縮小、地点選択 | ✅ |
| 投稿 | 地点を選んでワンタップ投稿、匿名、投稿時刻記録、鮮度表示、20秒ごと自動更新 | ✅ |
| 不正対策 | 同一地点3分間隔、10分10件/ブラウザ、10分40件/IPハッシュ、通報（3件で自動非表示）、管理者削除 | ✅ |
| 管理 | イベントCRUD、地点のマップ編集（クリック追加・ドラッグ移動）、投稿・通報管理、ジャンル/カテゴリ/選択肢設定 | ✅ |
| 将来 | 自動収集パイプライン、管理者アカウント、画像アップロード、全文検索、SSE/WebSocket、PWA、広告 | – |

## 3. 技術構成

| レイヤ | プロトタイプ | 本番想定 | 理由 |
|---|---|---|---|
| フレームワーク | Next.js 15 (App Router, TypeScript) | 同じ | SSRでSEO（イベントページ数万件）＋APIを1つに集約、保守者が多い |
| DB | PostgreSQL（ローカルは組込みの PGlite、`DATABASE_URL` 指定時は Neon / Supabase 等） | 同じ（Vercel + Neon） | サーバーレスでもデータが永続。将来 PostGIS・pg_trgm で地理/全文検索 |
| 地図 | Leaflet + OSM タイル | Leaflet + 商用利用可タイル（MapTiler 等）or 自前ベクタタイル | 軽量・無料。OSM公式タイルは大量アクセス不可のため本番は差し替え（`NEXT_PUBLIC_TILE_URL`） |
| リアルタイム | 20秒ポーリング | ポーリング＋CDN短期キャッシュ → 必要に応じ SSE / Supabase Realtime | 来場者数のピークでも安定・安価 |
| ホスティング | Vercel（GitHub 連携で自動デプロイ） | 同じ | 無料枠から開始、規模に応じて有料プラン |
| 管理認証 | 共有パスワード＋署名Cookie | Supabase Auth / Auth.js ＋ロール | |

## 4. データベース設計

```
genres ──< genre_categories >── spot_categories >── report_types
  │                                   ▲  (選択肢JSON: value/label/level)
  │                                   │
events ──< event_categories >─────────┘   ※行があればジャンル既定を上書き
  │
  ├──< spots (category_id, lat, lng)
  │        │
  └──< reports (spot_id, value, label, level, client_id, ip_hash, created_at, hidden, flag_count)
                 │
                 └──< report_flags (client_id UNIQUE per report, reason, resolved)
```

- **ジャンル差の吸収**: 「ジャンル → 既定カテゴリ」「カテゴリ → 投稿選択肢セット」「イベント → 個別上書き」の3段で、コード変更なしに管理画面から設定。
- **表示項目の差**: `genres.info_fields` で詳細ページの項目と順序を指定、`events.extra_info` でジャンル固有項目（打ち上げ数・出演者等）。
- **投稿**: `label` を投稿時にスナップショット保存（選択肢変更後も履歴が壊れない）。`level` 0〜4 で色分け。
- **出典管理**: `source_url` / `source_checked_at` / `is_sample`。
- インデックス: events(start_date,end_date)/(prefecture)/(genre_id)、reports(event_id,created_at)/(spot_id,created_at)/(client_id,created_at)。

## 5. 鮮度ルール（`lib/freshness.ts`）

| 経過 | 表示 |
|---|---|
| 30分未満 | 最新情報（「5分前」） |
| 30〜90分 | 「45分前の情報」＋薄色・点線マーカー（古い可能性を明示） |
| 90分以上 | 現在の状況に反映しない →「現在の情報はありません」 |

投稿は開催期間中のみ受付（中止・延期イベントは不可）。

## 6. ページ構成・画面遷移

```
/ (トップ) ──検索/チップ──> /search?q&genre&pref&when&date ──> /events/[slug]
                                                            ├ #live  地図＋地点リスト＋ボトムシート(ワンタップ投稿)＋投稿フィード
                                                            └ #info  基本情報・情報元
/admin-login → /admin (イベント一覧)
                 ├ /admin/events/new
                 ├ /admin/events/[id]  地点マップ編集＋イベント編集＋削除
                 ├ /admin/reports(?flagged=1|event=ID)  非表示/再表示/削除/問題なし
                 └ /admin/settings  ジャンル・カテゴリ・選択肢セット
API: GET /api/events/[id]/live, POST /api/reports, POST /api/reports/[id]/flag
```

## 7. 自動収集（次フェーズの設計方針）

1. 収集元レジストリ（URL・利用規約確認日・許可状態）を管理し、**許可されたソース/API/オープンデータのみ**取得（robots.txt 遵守）。
2. 取得HTML → LLMでイベント名・日付・場所・時間・ジャンルを構造化抽出（JSONスキーマ指定）→ ジオコーディング。
3. `event_candidates` ステージングテーブルに保存（情報元URL・取得日時付き）→ 管理画面で確認・修正して公開。
4. 開催日・中止情報など誤りが問題になる項目は必ず人の確認を通す。
