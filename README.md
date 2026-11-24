# イベLive（プロトタイプ）

全国のイベント情報と、来場者が投稿する会場のリアルタイム状況（混雑・待ち時間・駐車場など）を共有するWebサービスのMVP。
設計は [docs/DESIGN.md](docs/DESIGN.md) を参照。

## ローカルで起動

Node.js 20 以上。データベースの設定は不要です（`DATABASE_URL` が無い場合、組込み PostgreSQL（PGlite）を `data/pgdata` に作成）。

```bash
npm install
npm run build && npm start   # http://localhost:3000
```

- 初回起動時にテーブル作成とサンプルデータ投入が自動で行われます（開催日は起動日を基準に設定）。
- ローカルのサンプルを入れ直す: `npm run seed` → サーバーを再起動。
- 管理画面: `/admin`（ローカルの初期パスワードは `admin`）

## Vercel へのデプロイ

1. Vercel で **Add New → Project** から GitHub リポジトリ `event-live` を Import（設定はそのままで可）。
2. プロジェクトの **Storage → Create Database → Neon（Postgres）** を作成し、このプロジェクトに Connect。
   `DATABASE_URL` が自動で環境変数に追加されます。リージョンは日本に近い場所（例: Singapore）を推奨。
3. **Settings → Environment Variables** に以下を追加:

   | 変数 | 内容 |
   |---|---|
   | `ADMIN_PASSWORD` | 管理画面のパスワード（**必須**。未設定だと本番では管理画面にログインできません） |
   | `ADMIN_SECRET` | ログインCookie署名用のランダムな長い文字列（推奨） |
   | `IP_HASH_SALT` | IPアドレスのハッシュ用のランダムな文字列（推奨） |

4. **Settings → Functions → Function Region** をDBと同じリージョン（例: Singapore `sin1`）に設定。
5. **Deployments → Redeploy**。初回アクセス時にテーブル作成とサンプル投入が自動で行われます。

以後は `main` へ push するたびに自動でデプロイされます。URL は Settings → Domains で独自ドメインを追加・変更できます。

- **非公式表示**: 既定でサイト全体（ヘッダー・トップ・各イベントページ・フッター・ページタイトル）に「非公式・主催者とは無関係」を表示します。
  主催者と提携した場合などに外すときは `NEXT_PUBLIC_UNOFFICIAL=0`。訂正・削除依頼の受付先は `NEXT_PUBLIC_CONTACT_URL`（フォームURLや `mailto:`）で `/about` に表示されます。
- サンプルの日程が古くなったら: 管理画面のイベント一覧下部「サンプルデータをリセット」。
- 地図タイル: 既定は OpenStreetMap 公式タイル（試験運用向け）。本格公開時は商用利用可能なタイル提供元に切り替え、
  `NEXT_PUBLIC_TILE_URL` / `NEXT_PUBLIC_TILE_ATTRIBUTION` を設定してください。
- Neon 以外の PostgreSQL（Supabase など）も `DATABASE_URL` を設定すれば使えます（接続プーラーのURLを推奨）。

## サンプルデータ

5件とも **架空のイベント** で、名称に【サンプル】、`is_sample=1`、詳細ページに注意バナーを表示します。

| イベント | ジャンル | 日程 | 確認できること |
|---|---|---|---|
| みなと川 冬花火大会 | 花火 | 今日 | 投稿・鮮度表示（新しい／古い／期限切れ） |
| グリーンフィールド・ミュージックフェス | 音楽フェス | 今日〜明日 | 物販・ステージなどジャンル別カテゴリ |
| さくら通り 秋祭り | 祭り | 今週末 | 開催前（投稿不可・位置のみ表示） |
| ウィークエンド・ファーマーズマルシェ | マルシェ | 来週末 | 今後の予定 |
| クラフトフードフェス | フードフェス | 今週末 | 中止表示・「情報なし」表示 |
