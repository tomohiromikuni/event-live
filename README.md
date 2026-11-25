# EVENOW（イベナウ）プロトタイプ

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
- 管理画面: `/admin-login` でログイン →`/admin`（ローカルの初期パスワードは `admin`）。本番では `ADMIN_ENTRY_PATH` で決めた URL が入り口になります。

## Vercel へのデプロイ

1. Vercel で **Add New → Project** から GitHub リポジトリ `event-live` を Import（設定はそのままで可）。
2. プロジェクトの **Storage → Create Database → Neon（Postgres）** を作成し、このプロジェクトに Connect。
   `DATABASE_URL` が自動で環境変数に追加されます。リージョンは日本に近い場所（例: Singapore）を推奨。
3. **Settings → Environment Variables** に以下を追加:

   | 変数 | 内容 |
   |---|---|
   | `ADMIN_PASSWORD` | 管理画面のパスワード（**必須**。未設定だと本番では管理画面にログインできません） |
   | `ADMIN_SECRET` | ログインCookie署名用のランダムな長い文字列（推奨） |
   | `ADMIN_ENTRY_PATH` | 管理画面の入り口のURL（推奨）。例 `k3f9x2q7...` にすると `https://<ドメイン>/k3f9x2q7...` でだけログイン画面が開き、`/admin-login` や未ログインの `/admin` は「ページが見つかりません」になります。リポジトリが公開のため、値はコードに書かずここにだけ設定 |
   | `IP_HASH_SALT` | IPアドレスのハッシュ用のランダムな文字列（推奨） |

4. **Settings → Functions → Function Region** をDBと同じリージョン（例: Singapore `sin1`）に設定。
5. **Deployments → Redeploy**。初回アクセス時にテーブル作成とサンプル投入が自動で行われます。

以後は `main` へ push するたびに自動でデプロイされます。URL は Settings → Domains で独自ドメインを追加・変更できます。

- **非公式表示**: 既定でサイト全体（ヘッダー・トップ・各イベントページ・フッター・ページタイトル）に「非公式・主催者とは無関係」を表示します。
  主催者と提携した場合などに外すときは `NEXT_PUBLIC_UNOFFICIAL=0`。
- **掲載停止の申請・問い合わせ**: 各イベントページ下部の「掲載停止を申請する」（理由は選択式＋自由記述）と `/contact` のフォーム。
  内容はDBに保存され管理画面「✉️ 問い合わせ」で確認でき、`CONTACT_EMAIL` 宛にメールでも通知されます（送信には Resend の `RESEND_API_KEY` が必要）。
  通知先アドレスは公開リポジトリに書かず、Vercel の環境変数で設定してください。
- サンプルの日程が古くなったら: 管理画面のイベント一覧下部「サンプルデータをリセット」。
- イベントの一括登録: 管理画面「📥 下書きを貼り付け」に下書きJSON（形式は [docs/DRAFT_FORMAT.md](docs/DRAFT_FORMAT.md)）を貼ると、イベント情報と簡易マップをまとめて登録できます（非公開で作成→確認後に公開）。
- 会場マップは外部の地図データを使わない「簡易マップ（見取り図）」です。管理画面のイベント編集で、
  運営のガイドマップを下敷き（ブラウザ内のみ・保存しない）にしてエリア・線・施設を描きます。
- Search Console（HTMLタグ方式）: タグの content の値を `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` に設定。
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

## 自動収集の設定（第1段階）

1. Vercel の環境変数に追加して Redeploy
   - `ANTHROPIC_API_KEY`：Claude API のキー（Sensitive）。未設定ならページの取得だけ行い、AIでの整理はしない
   - `COLLECT_MODEL`（任意）：既定は `claude-haiku-5-5`（費用優先）。精度が足りないときだけ `claude-opus-5-5`
   - `CRON_SECRET`：16文字以上のランダムな文字列（Sensitive）
2. GitHub のリポジトリ → Settings → Secrets and variables → Actions に `CRON_SECRET`（同じ値）を登録
   （これで 毎日の自動収集＋会場マップの自動作成 `.github/workflows/collect.yml` と、15分ごとのSNS下書き作成 `.github/workflows/sns.yml` が動きます）
   （`.github/workflows/collect.yml` が毎日 4:17 に収集を実行。Actions タブから手動実行も可）
3. 管理画面「情報源」で、利用規約を確認した情報源だけを登録して「巡回する」にする
4. 管理画面「自動収集」で ON にする（「今すぐ1回実行」で試せる）
5. 「収集した候補」で内容を確認 → 承認すると非公開イベントができる → 会場マップを作って公開

## 会場マップの自動作成・X投稿（追加の設定）
- 会場マップの自動作成：追加の設定は不要（国土地理院・OpenStreetMap・Nominatim は無料。ガイドマップの読み取りは `ANTHROPIC_API_KEY` を使用）
- X投稿：X Developer Portal のアプリ（権限 Read and Write）の `X_API_KEY` / `X_API_SECRET` / `X_ACCESS_TOKEN` / `X_ACCESS_SECRET` を Vercel の環境変数に設定。
  未設定でも下書きの作成・確認はできる。自動投稿は管理画面「X投稿」でONにしたときだけ（初期OFF）。
