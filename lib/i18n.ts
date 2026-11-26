/**
 * 画面の言語（日本語・英語）。日本語の文言をそのまま「鍵」にして、英語のときだけ置き換える
 * （日本語版の文言を書き換えずに済み、訳が無い文言は日本語のまま出る）。
 * {n} などは差し込み。イベントの中身（名前・公式情報・施設名）は AI で訳したもの（lib/translate.ts）を使う。
 */
export type Lang = 'ja' | 'en';
export const LANGS: Lang[] = ['ja', 'en'];

const EN: Record<string, string> = {
  // 上部・タブ
  'いまの混雑': 'Crowd now', '来場者がタップで共有（登録不要）': 'Shared by visitors · no sign-up', '来場者{n}件・最終 {t}': '{n} visitor reports · last {t}',
  '表示の切り替え': 'Switch view', '駐車場': 'Parking', 'シャトルバス': 'Shuttle bus', 'トイレ': 'Toilets', 'バス': 'Shuttle', '屋台': 'Food stalls',
  '投稿なし': 'No reports', '{n}か所': '{n} places', '場所の案内': 'Locations', '会場': 'Venue',
  '駐車場・トイレの現地の状況': 'Parking & toilets: live status', '駐車場・シャトルバス・トイレの現地の状況': 'Parking, shuttle & toilets: live status',
  '写真はイメージです': 'Image only', 'イメージ': 'Image', '🗺️ 会場マップを見る': '🗺️ Venue map', '会場マップを見る': 'Venue map', '写真：': 'Photo: ',
  // カード
  '現地の投稿': 'Visitor report', 'あなたの投稿': 'Your report', '会場まわりのトイレ：': 'Toilets around the venue: ', '多め': 'many', 'ふつう': 'average', '少なめ': 'few',
  '（地図上で{n}か所）': ' ({n} on the map)', '地図の位置は未確認': 'location not confirmed', '位置は目安': 'approx. location',
  'ほかの{n}か所を表示': 'Show {n} more', '未確認': 'Not confirmed', '🚧 交通規制：': '🚧 Traffic restrictions: ', '公式情報': 'Official info', '続きを見る': 'More',
  '{x}のいまを投稿する': 'Report {x} now', '{x}の状況を見る': 'See {x} status',
  '屋台・飲食エリア': 'Food stalls & areas', '場所の案内のみ': 'Location only', '地図で見る ›': 'See on map ›', '地図のオレンジの範囲が、屋台・飲食エリアです': 'Orange areas on the map are food stall areas',
  '仮設': 'Temporary', '臨時': 'Temporary', '公式案内': 'Official', '1人の報告': '1 visitor report', '{n}人が確認': '{n} confirmed',
  // 地図
  '{x}の地図': '{x} map', '会場の地図': 'Venue map', '地点をタップで、状況の確認・投稿ができます': 'Tap a place to see or report its status', '地図を読み込み中…': 'Loading map…',
  '＋ ここにトイレ・駐車場がある（現在地で報告）': '+ There is a toilet/parking here (report at my location)',
  'いる場所に何がありますか？（位置をこの1回だけ送ります。公式の情報とは分けて表示します）': 'What is here? (Your location is sent only this once. Shown separately from official info.)',
  '🚻 トイレ': '🚻 Toilet', '🅿️ 駐車場': '🅿️ Parking', '🚌 乗り場': '🚌 Bus stop', 'やめる': 'Cancel',
  '良好': 'Good', 'やや': 'Fair', '混雑': 'Busy', '非常に': 'Very busy', '利用不可': 'Closed', '情報なし': 'No info', '点線＝{n}分以上前': 'Dotted = {n}+ min ago', '破線の枠＝位置は目安': 'Dashed = approx. location',
  '施設・会場の範囲の一部：': 'Some places & venue area: ',
  '📍 自分から近い順': '📍 Nearest to you', '🎪 会場から近い順': '🎪 Nearest to the venue',
  '会場から離れているので、会場からの方角で表示しています': 'You are far from the venue, so directions are from the venue.',
  'いちばん近い': 'Nearest', '（青い点があなた）': ' (blue dot = you)',
  '📍 自分の位置を地図に表示する': '📍 Show my location', '📍 現在地の表示をやめる': '📍 Hide my location', '位置は画面に出すだけで、送信・保存しません': 'Your location stays on your phone and is never sent or saved',
  'いまの場所は会場から': 'You are ', '。地図は会場付近のままです': ' from the venue. The map stays on the venue.',
  '行きたい駐車場などの地点をタップ →「📍 この場所に行く」で、そこまでの道順が出ます': 'Tap a parking lot or other place → “📍 Go here” for directions',
  '自分の位置を見る': 'Show me', '約{km}': 'about {km}', '📍 現在地': '📍 My location', '🎪 会場へ': '🎪 Venue',
  // 地点の画面
  '{x}の状況': '{x} status', '📍 この場所に行く（Googleマップ）': '📍 Go here (Google Maps)', '📍 この辺りに行く（Googleマップ）': '📍 Go near here (Google Maps)',
  '来場者の報告': 'Visitor report', '（公式の情報ではありません）': ' (not official)', 'まだ1人の報告です': 'only 1 report so far', '{n}人が「ここにある」と確認': '{n} confirmed it is here', '見つからない {n}人': 'not found: {n}',
  '✓ ここにある': '✓ It is here', '✗ 見つからない': '✗ Not found', '現在の状況：': 'Now: ', '現在の情報はありません': 'No current info',
  'あなたが見た、いまの状況は？': 'What do you see right now?', 'ほかの人の投稿ではなく、実際に見た状況を選んでください': 'Choose what you actually see, not what others posted',
  '投稿は匿名で、投稿時刻とともに公開されます。': 'Reports are anonymous and shown with the time.', '参考：いまの表示は「{x}」（{t}）': 'For reference: now showing “{x}” ({t})',
  'この場所への最近の投稿': 'Recent reports here', '閉じる': 'Close', '屋台・飲食エリアは場所の案内のみです（混雑の投稿は受け付けていません）。': 'Food stalls show locations only (no crowd reports).',
  'この地点は施設の位置情報のみ掲載しています。': 'Location only for this place.',
  // お礼
  '投稿ありがとうございます！': 'Thanks for your report!', 'あなたの情報がイベント参加者に共有されました。': 'Your report is now shared with other visitors.',
  'イベント': 'Event', '投稿内容': 'Report', '投稿日時': 'Time', '自分の投稿を見る': 'See my report', 'この端末の貢献実績を見る': 'My contributions', 'ほかの来場者にも知らせる': 'Tell other visitors',
  // メッセージ
  '投稿できませんでした': 'Could not post', '通信エラーが発生しました': 'Network error', '確認ありがとうございます': 'Thanks for confirming', '「見つからない」を受け付けました': '“Not found” received',
  '送れませんでした': 'Could not send', 'この端末では現在地を使えません': 'Location is not available on this device', '現在地を確認しています…': 'Getting your location…',
  '報告できませんでした': 'Could not report', 'すでに報告がある場所でした。確認として受け付けました': 'Already reported here — counted as a confirmation',
  '報告しました。ほかの人が確認すると、地図にはっきり出ます': 'Reported. It shows clearly once others confirm it.', '現在地を取得できませんでした': 'Could not get your location',
  '投稿は開催期間中のみ受け付けています': 'Reports are accepted only during the event', '報告は開催中だけ受け付けています': 'Reports are accepted only during the event',
  '会場の近く（1.5km以内）にいるときだけ報告できます': 'You can report only within 1.5 km of the venue',
  // みんなに伝える・ページ下部
  'みんなに伝える': 'Share', 'X に投稿する': 'Post on X', 'LINE で送る': 'Send on LINE', '🔗 リンクをコピー': '🔗 Copy link', 'コピーしました': 'Copied',
  'ほかのアプリで送る': 'Share via…', 'X でみんなの投稿を見る →': 'See posts on X →', 'X に投稿すると ': 'Posting on X adds ', ' が付き、同じイベントに行く人とつながれます': ' so you can connect with others at the event',
  '開催概要': 'Event details', '開催時間': 'Hours', '開催場所': 'Venue', 'アクセス': 'Access', '最寄り駅': 'Nearest station', '入場料・チケット': 'Tickets', '主催者': 'Organizer', '公式サイト': 'Official site',
  '開催状況': 'Status', '開催予定': 'Scheduled', '中止': 'Canceled', '延期': 'Postponed', '公式サイトを開く ↗': 'Open official site ↗', '未確認：': 'Not confirmed: ', '情報元：': 'Source: ', '確認': 'checked',
  '訂正・お問い合わせ': 'Corrections & contact', '掲載停止の申請': 'Request removal', '開催中': 'Happening now', '● 開催中': '● Happening now',
  // 一覧・検索
  'イベントを探す': 'Find an event', 'イベント名・地名で探す（例：札幌）': 'Event or place name (e.g. Sapporo)', 'イベント名・地名で探す': 'Event or place name', '検索': 'Search',
  '開催中・近日のイベント': 'Happening now & soon', '開催予定のイベント': 'Upcoming events', '件': ' events', '探す': 'Search', '実績': 'Me',
};

export type T = (key: string, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang = 'ja'): T {
  return (key, vars) => {
    let s = lang === 'en' ? EN[key] ?? key : key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

/** 投稿の選択肢（DB の日本語の表示名）→ 英語 */
const LABEL_EN: Record<string, string> = {
  '空いている': 'No line', '少し並ぶ': 'Short line', '長い列': 'Long line', 'すぐ乗れる': 'Board now', '長い列（30分以上の目安）': 'Long line (30+ min)', '運休・終了': 'Not running',
  '空きあり': 'Spaces', '残りわずか': 'Almost full', '満車・入庫待ち': 'Full / queue', 'スムーズ': 'Smooth', 'やや渋滞': 'Slow', '渋滞': 'Jammed', '通行止め': 'Closed',
  'やや混雑': 'A bit busy', '混雑': 'Busy', '非常に混雑': 'Very busy',
};
export const trLabel = (label: string, lang: Lang) => (lang === 'en' ? LABEL_EN[label] ?? label : label);

const DIR_EN: Record<string, string> = { 北: 'north', 北東: 'northeast', 東: 'east', 南東: 'southeast', 南: 'south', 南西: 'southwest', 西: 'west', 北西: 'northwest' };
/** 自動で作った施設名・説明（「トイレ（会場から北へ約200m）」「立体・有料・規模：中（目安）」など）を英語に */
export function trAuto(text: string, lang: Lang): string {
  if (lang !== 'en' || !text) return text;
  return text
    .replace(/あなたから(北東|北西|南東|南西|北|東|南|西)へ約([\d.]+)(m|km)/g, (_, d, n, u) => `about ${n} ${u} ${DIR_EN[d]} of you`).replace(/あなたのすぐ近く/g, 'right near you')
    .replace(/会場から(北東|北西|南東|南西|北|東|南|西)へ(100m以内|約(\d+)m)/g, (_, d, all, m) => (m ? `about ${m} m ${DIR_EN[d]} of the venue` : `within 100 m ${DIR_EN[d]} of the venue`))
    .replace(/^トイレ（(.+)）$/, 'Toilet ($1)').replace(/^駐車場（(.+)）$/, 'Parking ($1)').replace(/^駐車場（周辺）$/, 'Parking (nearby)').replace(/^トイレ$/, 'Toilets')
    .replace(/規模：(大|中|小)（約(\d+)台）/, (_, s, n) => `${{ 大: 'Large', 中: 'Medium', 小: 'Small' }[s as '大']} (~${n} cars)`)
    .replace(/規模：(大|中|小)（目安）/, (_, s) => `${{ 大: 'Large', 中: 'Medium', 小: 'Small' }[s as '大']} (approx.)`)
    .replace(/立体/g, 'Multi-storey').replace(/地下/g, 'Underground').replace(/平面/g, 'Open-air').replace(/有料/g, 'Paid').replace(/無料/g, 'Free')
    .replace(/車いす対応/g, 'Wheelchair').replace(/おむつ替え台/g, 'Baby changing').replace(/男女共用/g, 'Unisex')
    .replace(/臨時駐車場（公式・(公式サイト|ガイドマップ)）/g, 'Temporary parking (official)').replace(/仮設トイレ（公式・(公式サイト|ガイドマップ)）/g, 'Temporary toilets (official)')
    .replace(/シャトルバス乗り場（公式・(公式サイト|ガイドマップ)）/g, 'Shuttle stop (official)').replace(/位置は名前からの目安/g, 'approx. location').replace(/地図の位置は未確認/g, 'location not confirmed')
    .replace(/位置は地図データの同じ名前の施設/g, 'located by name').replace(/（来場者の報告）/g, ' (visitor report)').replace(/来場者が現地から報告した場所（公式の情報ではありません）/g, 'Reported by a visitor (not official)')
    .replace(/・/g, ' · ');
}

const PREF_EN: Record<string, string> = {
  北海道: 'Hokkaido', 青森県: 'Aomori', 岩手県: 'Iwate', 宮城県: 'Miyagi', 秋田県: 'Akita', 山形県: 'Yamagata', 福島県: 'Fukushima', 茨城県: 'Ibaraki', 栃木県: 'Tochigi', 群馬県: 'Gunma',
  埼玉県: 'Saitama', 千葉県: 'Chiba', 東京都: 'Tokyo', 神奈川県: 'Kanagawa', 新潟県: 'Niigata', 富山県: 'Toyama', 石川県: 'Ishikawa', 福井県: 'Fukui', 山梨県: 'Yamanashi', 長野県: 'Nagano',
  岐阜県: 'Gifu', 静岡県: 'Shizuoka', 愛知県: 'Aichi', 三重県: 'Mie', 滋賀県: 'Shiga', 京都府: 'Kyoto', 大阪府: 'Osaka', 兵庫県: 'Hyogo', 奈良県: 'Nara', 和歌山県: 'Wakayama',
  鳥取県: 'Tottori', 島根県: 'Shimane', 岡山県: 'Okayama', 広島県: 'Hiroshima', 山口県: 'Yamaguchi', 徳島県: 'Tokushima', 香川県: 'Kagawa', 愛媛県: 'Ehime', 高知県: 'Kochi', 福岡県: 'Fukuoka',
  佐賀県: 'Saga', 長崎県: 'Nagasaki', 熊本県: 'Kumamoto', 大分県: 'Oita', 宮崎県: 'Miyazaki', 鹿児島県: 'Kagoshima', 沖縄県: 'Okinawa',
};
export const prefEn = (p: string) => PREF_EN[p] ?? p;

/** 日付の範囲（英語）：Nov 20 – Dec 25, 2026 */
export function fmtRangeEn(start: string, end: string): string {
  const f = (d: string, year = false) => new Date(`${d}T00:00:00+09:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'Asia/Tokyo' });
  return start === end ? f(start, true) : `${f(start)} – ${f(end, true)}`;
}

/** 「○分前」の英語版 */
export function relTimeEn(ts: number, now: number): string {
  const m = Math.max(0, Math.floor((now - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h${m % 60 ? ` ${m % 60} min` : ''} ago`;
}
