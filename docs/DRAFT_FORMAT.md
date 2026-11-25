# イベント下書きの形式（DRAFT_FORMAT）

管理画面「📥 下書きを貼り付け」（`/admin/import`）で取り込む JSON の形式です。
今は Claude がガイドマップ画像・公式情報から作成し、**将来の自動収集（公式サイト → AI で抽出）もこの形式を出力**します。
チェックと変換の実装は `lib/draft.ts`、取り込みは `app/admin/import-actions.ts`。

## 全体

```json
{
  "version": 1,
  "event": { ... },   // 新しいイベントとして登録するときに必要。既存イベントにマップだけ足すときは省略可
  "map":   { ... }    // 省略可
}
```

## event（イベント情報）

**事実として確認できた項目だけを入れる。推測で埋めない**（空なら公開ページで「情報なし」と表示）。

| キー | 必須 | 内容 |
|---|---|---|
| name | ○ | イベント名 |
| genre | ○ | ジャンルの slug（fireworks, festival, music, marche, food, expo, anime_game, sports, local, seasonal, other） |
| prefecture | ○ | 都道府県名（例: 山梨県） |
| start_date | ○ | 開始日 `YYYY-MM-DD` |
| end_date | | 終了日（1日だけなら省略） |
| city / venue_name / address | | 市区町村・会場名・住所 |
| time_text | | 開催時間（例: 10:00〜16:00） |
| summary | | 概要（自分の言葉で要約。公式文の丸写しはしない） |
| organizer / official_url | | 主催者・公式サイト |
| access / nearest_station / traffic_info / parking_info / ticket_info | | アクセス・最寄り駅・交通規制・駐車場・料金 |
| shuttle_info / toilet_info / food_info | | シャトルバス・トイレ・飲食エリア（公式に書かれている内容だけ） |
| extra_info | | ジャンル別の追加項目。「項目名: 値」を改行区切り |
| source_url / source_checked_at | 推奨 | 情報元URLと確認日 `YYYY-MM-DD` |

## map（簡易マップ）

位置は**ガイドマップ画像上の割合（%）**で表す。左上が `x=0, y=0`、右下が `x=100, y=100`。

| キー | 内容 |
|---|---|
| aspect | ガイドマップ画像の **高さ ÷ 幅**（例: 横1600×縦1000 → 0.625） |
| spots | 施設 `{ "category": "toilet", "name": "トイレ（東口）", "note": "", "x": 12.5, "y": 70 }` |
| areas | エリア `{ "style": "food", "label": "屋台エリア", "points": [[x,y], ...3点以上] }` |
| lines | 線 `{ "style": "path", "label": "メイン通路", "points": [[x,y], ...2点以上] }` |

- 施設の category: gate, toilet, food, parking, traffic, stage, merch, viewing, rest, first_aid, info（管理画面のカテゴリ設定の slug）
- エリアの style: viewing, food, stage, shop, rest, parking, closed, other_area
- 線の style: path, route, restriction
- ガイドマップの絵・装飾は再現しない。施設の位置と、エリア・通路のおおよその形だけを描く。

## 緯度経度で表す場合（projection: "geo"）

`"map": { "projection": "geo", ... }` とすると、施設は `{ "lat": 39.46, "lng": 140.47 }`、エリア・線の points は `[lat, lng]` で書ける。
取り込み時に全体が収まるよう自動で見取り図の座標へ変換する（aspect も自動計算）。

## Google マイマップから作る

管理画面「下書きを貼り付け」で Google マイマップの URL を入れて「読み込む」と、KML を取得して geo 形式の下書きを自動で作る（`lib/kml.ts`）。
フォルダ名・地点名のキーワード（トイレ・駐車場・案内所・救護・休憩・観覧・入口 など）で施設の種類を決め、
線（ルート等）とエリアも取り込む。分類できないもの（コンビニ・ゴミ箱など）は含めず、一覧で表示する。

## 取り込み時の動き

- 新しいイベントは **非公開** で作成される。管理者が内容とマップを確認・調整してから公開する。
- 既存イベントへの追加は、まだ何も描いていなければ用紙の比率を下書きに合わせる。
- 施設のカテゴリがジャンルの既定に無い場合は、イベント個別のカテゴリ設定に自動で追加する。

## 将来の自動化（予定）

1. 許可された情報源を定期的に巡回（Vercel Cron）→ 変化があったページだけ AI で読み取り、この形式の下書きを作る
2. 下書きは「承認待ち」として保存し、管理画面で確認 → 公開（誤情報の公開を防ぐため、最初は人の確認を必須にする）
3. 精度が安定したら、確認を省略できる項目を段階的に増やす
