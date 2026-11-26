/**
 * 画面の言語（日本語・英語・中国語 簡体字／繁体字・韓国語）。日本語の文言をそのまま「鍵」にして英語へ置き換え、
 * 中国語・韓国語は英語の文言を鍵にして置き換える（lib/i18n-dict.ts・繁体字は自動生成の lib/i18n-zht.ts）。
 * 訳が無い文言は英語（英語にも無ければ日本語）のまま出る。
 * {n} などは差し込み。イベントの中身（名前・公式情報・施設名）は AI で訳したもの（lib/translate.ts）を使う。
 */
import { DICT } from './i18n-dict';
import { ZHT } from './i18n-zht';
import { MORE } from './i18n-more';

export type Lang = 'ja' | 'en' | 'zh' | 'zh-tw' | 'ko' | 'vi';
export const LANGS: Lang[] = ['ja', 'en', 'zh', 'zh-tw', 'ko', 'vi'];
/** 外国語版（URL の頭に /en・/zh・/zh-tw・/ko・/vi） */
export const FOREIGN: Exclude<Lang, 'ja'>[] = ['en', 'zh', 'zh-tw', 'ko', 'vi'];
export { LANG_PATH_RE } from './langPath';
export const LANG_META: Record<Lang, { label: string; short: string; hreflang: string; html: string; og: string; locale: string }> = {
  ja: { label: '日本語', short: '日本語', hreflang: 'ja', html: 'ja', og: 'ja_JP', locale: 'ja-JP' },
  en: { label: 'English', short: 'EN', hreflang: 'en', html: 'en', og: 'en_US', locale: 'en-US' },
  zh: { label: '简体中文', short: '简体', hreflang: 'zh-Hans', html: 'zh-Hans', og: 'zh_CN', locale: 'zh-CN' },
  'zh-tw': { label: '繁體中文', short: '繁體', hreflang: 'zh-Hant', html: 'zh-Hant', og: 'zh_TW', locale: 'zh-TW' },
  ko: { label: '한국어', short: '한국어', hreflang: 'ko', html: 'ko', og: 'ko_KR', locale: 'ko-KR' },
  vi: { label: 'Tiếng Việt', short: 'VI', hreflang: 'vi', html: 'vi', og: 'vi_VN', locale: 'vi-VN' },
};
export const isLang = (x: string | null | undefined): x is Lang => !!x && (LANGS as string[]).includes(x);
/** URL の頭（日本語は ''） */
export const lp = (lang: Lang) => (lang === 'ja' ? '' : `/${lang}`);
/** hreflang の対応表（bare は日本語版のパス。withJa=false は外国語版だけのページ） */
export function altLanguages(bare: string, withJa = true): Record<string, string> {
  const path = (l: Lang) => `${lp(l)}${bare === '/' ? '' : bare}` || '/';
  return Object.fromEntries(LANGS.filter((l) => withJa || l !== 'ja').map((l) => [LANG_META[l].hreflang, path(l)]));
}

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
  '良好': 'Good', 'やや': 'Fair', '混雑': 'Busy', '非常に': 'Very busy', '利用不可': 'Closed', '情報なし': 'No info', '点線＝{n}分以上前': 'Dotted = {n}+ min ago', '{n}分以上前': '{n}+ min ago', '破線の枠＝位置は目安': 'Dashed = approx. location',
  '施設・会場の範囲の一部：': 'Some places & venue area: ',
  '📍 自分から近い順': '📍 Nearest to you', '🎪 会場から近い順': '🎪 Nearest to the venue',
  '会場から離れているので、会場からの方角で表示しています': 'You are far from the venue, so directions are from the venue.',
  'いちばん近い': 'Nearest', '（青い点があなた）': ' (blue dot = you)',
  '📍 自分の位置を地図に表示する': '📍 Show my location', '📍 現在地の表示をやめる': '📍 Hide my location', '位置は画面に出すだけで、送信・保存しません': 'Your location stays on your phone and is never sent or saved',
  'いまの場所は会場から': 'You are ', '。地図は会場付近のままです': ' from the venue. The map stays on the venue.',
  '行きたい駐車場などの地点をタップ →「📍 この場所に行く」で、そこまでの道順が出ます': 'Tap a parking lot or other place → “📍 Go here” for directions',
  '自分の位置を見る': 'Show me', '約{km}': 'about {km}', '📍 現在地': '📍 My location', '🎪 会場へ': '🎪 Venue',
  // 地点の画面
  '{x}の状況': '{x} status', '行く': 'Go', 'Googleマップ': 'Google Maps', '📍 ここへ行く': '📍 Go here', '📍 この辺りへ行く': '📍 Go near here', '青い点があなた': 'Blue dot = you',
  'いま見た状況をタップ': 'Tap what you see now', '現在の状況': 'Status now', '現在：': 'Now: ', '実際に見た状況を選んでください・匿名で時刻とともに公開': 'Choose what you actually see · anonymous, shown with the time', '📍 この場所に行く（Googleマップ）': '📍 Go here (Google Maps)', '📍 この辺りに行く（Googleマップ）': '📍 Go near here (Google Maps)',
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
  'みんなに伝える': 'Share', 'に投稿する': 'Post', 'LINE で送る': 'Send on LINE', '🔗 リンクをコピー': '🔗 Copy link', 'コピーしました': 'Copied',
  'ほかのアプリで送る': 'Share via…', 'X でみんなの投稿を見る →': 'See posts on X →', 'X に投稿すると ': 'Posting on X adds ', ' が付き、同じイベントに行く人とつながれます': ' so you can connect with others at the event',
  '開催概要': 'Event details', '開催時間': 'Hours', '開催場所': 'Venue', 'アクセス': 'Access', '最寄り駅': 'Nearest station', '入場料・チケット': 'Tickets', '主催者': 'Organizer', '公式サイト': 'Official site',
  '開催状況': 'Status', '開催予定': 'Scheduled', '中止': 'Canceled', '延期': 'Postponed', '公式サイトを開く ↗': 'Open official site ↗', '未確認：': 'Not confirmed: ', '情報元：': 'Source: ', '確認': 'checked',
  '訂正・お問い合わせ': 'Corrections & contact', '掲載停止の申請': 'Request removal', '開催中': 'Happening now', '● 開催中': '● Happening now',
  // 一覧・検索
  'イベントを探す': 'Find an event', 'イベント名・地名で探す（例：札幌）': 'Event or place name (e.g. Sapporo)', 'イベント名・地名で探す': 'Event or place name', '検索': 'Search',
  '開催中・近日のイベント': 'Happening now & soon', '開催予定のイベント': 'Upcoming events', '件': ' events', '探す': 'Search', '実績': 'Me',
};

function fill(s: string, vars?: Record<string, string | number>) {
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
/** 英語の文言を中国語・韓国語へ（無ければ英語のまま） */
function fromEn(en: string, lang: Lang): string {
  if (lang === 'zh') return DICT[en]?.[0] ?? en;
  if (lang === 'ko') return DICT[en]?.[1] ?? en;
  if (lang === 'zh-tw') return ZHT[en] ?? en;
  if (lang === 'vi') return MORE.vi[en] ?? en;
  return en;
}

export type T = (key: string, vars?: Record<string, string | number>) => string;

/** 日本語の文言を鍵にした翻訳（日本語版の文言をそのまま使える） */
export function makeT(lang: Lang = 'ja'): T {
  return (key, vars) => fill(lang === 'ja' ? key : fromEn(EN[key] ?? key, lang), vars);
}
/** 英語の文言を鍵にした翻訳（外国語版だけのページ・英語で書いた文言用） */
export function makeTx(lang: Lang): T {
  return (en, vars) => fill(fromEn(en, lang), vars);
}

/** 投稿の選択肢（DB の日本語の表示名）→ 各言語 */
const LABEL_EN: Record<string, string> = {
  '空いている': 'No line', '少し並ぶ': 'Short line', '長い列': 'Long line', 'すぐ乗れる': 'Board now', '長い列（30分以上の目安）': 'Long line (30+ min)', '運休・終了': 'Not running',
  '空きあり': 'Spaces', '残りわずか': 'Almost full', '満車・入庫待ち': 'Full / queue', 'スムーズ': 'Smooth', 'やや渋滞': 'Slow', '渋滞': 'Jammed', '通行止め': 'Closed',
  'やや混雑': 'A bit busy', '混雑': 'Busy', '非常に混雑': 'Very busy',
};
export const trLabel = (label: string, lang: Lang) => (lang === 'ja' ? label : fromEn(LABEL_EN[label] ?? label, lang));

type Auto = {
  dir: Record<string, string>; ofYou: (n: string, u: string, d: string) => string; near: string;
  ofVenue: (m: string, d: string) => string; within: (d: string) => string;
  paren: (a: string, b: string) => string; toilet: string; toilets: string; parking: string; nearby: string;
  size: Record<string, string>; cars: (s: string, n: string) => string; approx: (s: string) => string; words: [RegExp, string][]; sep: string;
};
const ZH_WORDS: [RegExp, string][] = [
  [/立体/g, '立体'], [/地下/g, '地下'], [/平面/g, '平面'], [/有料/g, '收费'], [/無料/g, '免费'], [/車いす対応/g, '无障碍'], [/おむつ替え台/g, '换尿布台'], [/男女共用/g, '男女共用'],
  [/臨時駐車場（公式・(公式サイト|ガイドマップ)）/g, '临时停车场（官方）'], [/仮設トイレ（公式・(公式サイト|ガイドマップ)）/g, '临时厕所（官方）'], [/シャトルバス乗り場（公式・(公式サイト|ガイドマップ)）/g, '接驳巴士乘车处（官方）'],
  [/位置は名前からの目安/g, '根据名称推测的大致位置'], [/地図の位置は未確認/g, '位置未确认'], [/位置は地図データの同じ名前の施設/g, '按名称定位'], [/（来場者の報告）/g, '（到场者报告）'],
  [/来場者が現地から報告した場所（公式の情報ではありません）/g, '到场者在现场报告的地点（非官方信息）'],
];
const ZHT_WORDS: [RegExp, string][] = ZH_WORDS.map(([r, w]) => [r, w.replace('收费', '收費').replace('免费', '免費').replace('无障碍', '無障礙').replace('换尿布台', '尿布台').replace('临时停车场', '臨時停車場').replace('临时厕所', '臨時廁所')
  .replace('接驳巴士乘车处', '接駁巴士乘車處').replace('根据名称推测的大致位置', '依名稱推測的大致位置').replace('位置未确认', '位置未確認').replace('按名称定位', '依名稱定位').replace('到场者报告', '到場者回報')
  .replace('到场者在现场报告的地点（非官方信息）', '到場者在現場回報的地點（非官方資訊）')]);
const AUTO: Record<Exclude<Lang, 'ja'>, Auto> = {
  vi: undefined as unknown as Auto,
  en: {
    dir: { 北: 'north', 北東: 'northeast', 東: 'east', 南東: 'southeast', 南: 'south', 南西: 'southwest', 西: 'west', 北西: 'northwest' },
    ofYou: (n, u, d) => `about ${n} ${u} ${d} of you`, near: 'right near you', ofVenue: (m, d) => `about ${m} m ${d} of the venue`, within: (d) => `within 100 m ${d} of the venue`,
    paren: (a, b) => `${a} (${b})`, toilet: 'Toilet', toilets: 'Toilets', parking: 'Parking', nearby: 'nearby',
    size: { 大: 'Large', 中: 'Medium', 小: 'Small' }, cars: (s, n) => `${s} (~${n} cars)`, approx: (s) => `${s} (approx.)`,
    words: [
      [/立体/g, 'Multi-storey'], [/地下/g, 'Underground'], [/平面/g, 'Open-air'], [/有料/g, 'Paid'], [/無料/g, 'Free'], [/車いす対応/g, 'Wheelchair'], [/おむつ替え台/g, 'Baby changing'], [/男女共用/g, 'Unisex'],
      [/臨時駐車場（公式・(公式サイト|ガイドマップ)）/g, 'Temporary parking (official)'], [/仮設トイレ（公式・(公式サイト|ガイドマップ)）/g, 'Temporary toilets (official)'], [/シャトルバス乗り場（公式・(公式サイト|ガイドマップ)）/g, 'Shuttle stop (official)'],
      [/位置は名前からの目安/g, 'approx. location'], [/地図の位置は未確認/g, 'location not confirmed'], [/位置は地図データの同じ名前の施設/g, 'located by name'], [/（来場者の報告）/g, ' (visitor report)'],
      [/来場者が現地から報告した場所（公式の情報ではありません）/g, 'Reported by a visitor (not official)'],
    ], sep: ' · ',
  },
  zh: {
    dir: { 北: '北', 北東: '东北', 東: '东', 南東: '东南', 南: '南', 南西: '西南', 西: '西', 北西: '西北' },
    ofYou: (n, u, d) => `在你${d}方约${n}${u}`, near: '就在你附近', ofVenue: (m, d) => `在会场${d}方约${m}m`, within: (d) => `在会场${d}方100m以内`,
    paren: (a, b) => `${a}（${b}）`, toilet: '厕所', toilets: '厕所', parking: '停车场', nearby: '周边',
    size: { 大: '大', 中: '中', 小: '小' }, cars: (s, n) => `规模：${s}（约${n}辆）`, approx: (s) => `规模：${s}（估计）`, words: ZH_WORDS, sep: '・',
  },
  'zh-tw': {
    dir: { 北: '北', 北東: '東北', 東: '東', 南東: '東南', 南: '南', 南西: '西南', 西: '西', 北西: '西北' },
    ofYou: (n, u, d) => `在你${d}方約${n}${u}`, near: '就在你附近', ofVenue: (m, d) => `在會場${d}方約${m}m`, within: (d) => `在會場${d}方100m以內`,
    paren: (a, b) => `${a}（${b}）`, toilet: '廁所', toilets: '廁所', parking: '停車場', nearby: '周邊',
    size: { 大: '大', 中: '中', 小: '小' }, cars: (s, n) => `規模：${s}（約${n}輛）`, approx: (s) => `規模：${s}（估計）`, words: ZHT_WORDS, sep: '・',
  },
  ko: {
    dir: { 北: '북', 北東: '북동', 東: '동', 南東: '남동', 南: '남', 南西: '남서', 西: '서', 北西: '북서' },
    ofYou: (n, u, d) => `내 위치에서 ${d}쪽 약 ${n}${u}`, near: '바로 근처', ofVenue: (m, d) => `행사장에서 ${d}쪽 약 ${m}m`, within: (d) => `행사장에서 ${d}쪽 100m 이내`,
    paren: (a, b) => `${a} (${b})`, toilet: '화장실', toilets: '화장실', parking: '주차장', nearby: '주변',
    size: { 大: '대', 中: '중', 小: '소' }, cars: (s, n) => `규모: ${s} (약 ${n}대)`, approx: (s) => `규모: ${s} (추정)`,
    words: [
      [/立体/g, '입체'], [/地下/g, '지하'], [/平面/g, '평면'], [/有料/g, '유료'], [/無料/g, '무료'], [/車いす対応/g, '휠체어 이용 가능'], [/おむつ替え台/g, '기저귀 교환대'], [/男女共用/g, '남녀 공용'],
      [/臨時駐車場（公式・(公式サイト|ガイドマップ)）/g, '임시 주차장 (공식)'], [/仮設トイレ（公式・(公式サイト|ガイドマップ)）/g, '임시 화장실 (공식)'], [/シャトルバス乗り場（公式・(公式サイト|ガイドマップ)）/g, '셔틀버스 승차장 (공식)'],
      [/位置は名前からの目安/g, '이름으로 찾은 대략적인 위치'], [/地図の位置は未確認/g, '위치 미확인'], [/位置は地図データの同じ名前の施設/g, '이름으로 위치 확인'], [/（来場者の報告）/g, ' (방문자 제보)'],
      [/来場者が現地から報告した場所（公式の情報ではありません）/g, '방문자가 현장에서 제보한 장소 (공식 정보 아님)'],
    ], sep: ' · ',
  },
};
/** ベトナム語の自動の名前・説明 */
function AUTO_MORE() {
  const official = (t: string, p: string, s: string, a: string, nf: string, bn: string, vr: string, vrl: string): [RegExp, string][] => [
    [/臨時駐車場（公式・(公式サイト|ガイドマップ)）/g, t], [/仮設トイレ（公式・(公式サイト|ガイドマップ)）/g, p], [/シャトルバス乗り場（公式・(公式サイト|ガイドマップ)）/g, s],
    [/位置は名前からの目安/g, a], [/地図の位置は未確認/g, nf], [/位置は地図データの同じ名前の施設/g, bn], [/（来場者の報告）/g, vr], [/来場者が現地から報告した場所（公式の情報ではありません）/g, vrl],
  ];
  Object.assign(AUTO, {
    vi: {
      dir: { 北: 'phía bắc', 北東: 'phía đông bắc', 東: 'phía đông', 南東: 'phía đông nam', 南: 'phía nam', 南西: 'phía tây nam', 西: 'phía tây', 北西: 'phía tây bắc' },
      ofYou: (n, u, d) => `cách bạn khoảng ${n} ${u} về ${d}`, near: 'ngay gần bạn', ofVenue: (m, d) => `cách địa điểm khoảng ${m} m về ${d}`, within: (d) => `trong vòng 100 m về ${d} địa điểm`,
      paren: (a, b) => `${a} (${b})`, toilet: 'Nhà vệ sinh', toilets: 'Nhà vệ sinh', parking: 'Bãi đỗ xe', nearby: 'xung quanh',
      size: { 大: 'Lớn', 中: 'Vừa', 小: 'Nhỏ' }, cars: (z, n) => `${z} (~${n} xe)`, approx: (z) => `${z} (ước tính)`,
      words: [[/立体/g, 'Nhiều tầng'], [/地下/g, 'Ngầm'], [/平面/g, 'Ngoài trời'], [/有料/g, 'Có phí'], [/無料/g, 'Miễn phí'], [/車いす対応/g, 'Cho xe lăn'], [/おむつ替え台/g, 'Bàn thay tã'], [/男女共用/g, 'Dùng chung nam nữ'],
        ...official('Bãi đỗ xe tạm (chính thức)', 'Nhà vệ sinh tạm (chính thức)', 'Điểm đón xe buýt đưa đón (chính thức)', 'vị trí gần đúng', 'chưa xác nhận vị trí', 'xác định theo tên', ' (khách báo cáo)', 'Khách báo cáo tại chỗ (không chính thức)')], sep: ' · ',
    },
  } satisfies Record<'vi', Auto>);
}
AUTO_MORE();
const D = '(北東|北西|南東|南西|北|東|南|西)';
/** 自動で作った施設名・説明（「トイレ（会場から北へ約200m）」「立体・有料・規模：中（目安）」など）を各言語に */
export function trAuto(text: string, lang: Lang): string {
  if (lang === 'ja' || !text) return text;
  const a = AUTO[lang];
  let s = text
    .replace(new RegExp(`あなたから${D}へ約([\\d.]+)(m|km)`, 'g'), (_, d, n, u) => a.ofYou(n, u, a.dir[d])).replace(/あなたのすぐ近く/g, a.near)
    .replace(new RegExp(`会場から${D}へ(100m以内|約(\\d+)m)`, 'g'), (_, d, _all, m) => (m ? a.ofVenue(m, a.dir[d]) : a.within(a.dir[d])))
    .replace(/^トイレ（(.+)）$/, (_, x) => a.paren(a.toilet, x)).replace(/^駐車場（周辺）$/, a.paren(a.parking, a.nearby)).replace(/^駐車場（(.+)）$/, (_, x) => a.paren(a.parking, x)).replace(/^トイレ$/, a.toilets)
    .replace(/規模：(大|中|小)（約(\d+)台）/, (_, z, n) => a.cars(a.size[z], n))
    .replace(/規模：(大|中|小)（目安）/, (_, z) => a.approx(a.size[z]));
  for (const [r, w] of a.words) s = s.replace(r, w);
  return s.replace(/・/g, a.sep);
}

const PREF_EN: Record<string, string> = {
  北海道: 'Hokkaido', 青森県: 'Aomori', 岩手県: 'Iwate', 宮城県: 'Miyagi', 秋田県: 'Akita', 山形県: 'Yamagata', 福島県: 'Fukushima', 茨城県: 'Ibaraki', 栃木県: 'Tochigi', 群馬県: 'Gunma',
  埼玉県: 'Saitama', 千葉県: 'Chiba', 東京都: 'Tokyo', 神奈川県: 'Kanagawa', 新潟県: 'Niigata', 富山県: 'Toyama', 石川県: 'Ishikawa', 福井県: 'Fukui', 山梨県: 'Yamanashi', 長野県: 'Nagano',
  岐阜県: 'Gifu', 静岡県: 'Shizuoka', 愛知県: 'Aichi', 三重県: 'Mie', 滋賀県: 'Shiga', 京都府: 'Kyoto', 大阪府: 'Osaka', 兵庫県: 'Hyogo', 奈良県: 'Nara', 和歌山県: 'Wakayama',
  鳥取県: 'Tottori', 島根県: 'Shimane', 岡山県: 'Okayama', 広島県: 'Hiroshima', 山口県: 'Yamaguchi', 徳島県: 'Tokushima', 香川県: 'Kagawa', 愛媛県: 'Ehime', 高知県: 'Kochi', 福岡県: 'Fukuoka',
  佐賀県: 'Saga', 長崎県: 'Nagasaki', 熊本県: 'Kumamoto', 大分県: 'Oita', 宮崎県: 'Miyazaki', 鹿児島県: 'Kagoshima', 沖縄県: 'Okinawa',
};
const PREF_KO: Record<string, string> = {
  北海道: '홋카이도', 青森県: '아오모리현', 岩手県: '이와테현', 宮城県: '미야기현', 秋田県: '아키타현', 山形県: '야마가타현', 福島県: '후쿠시마현', 茨城県: '이바라키현', 栃木県: '도치기현', 群馬県: '군마현',
  埼玉県: '사이타마현', 千葉県: '지바현', 東京都: '도쿄도', 神奈川県: '가나가와현', 新潟県: '니가타현', 富山県: '도야마현', 石川県: '이시카와현', 福井県: '후쿠이현', 山梨県: '야마나시현', 長野県: '나가노현',
  岐阜県: '기후현', 静岡県: '시즈오카현', 愛知県: '아이치현', 三重県: '미에현', 滋賀県: '시가현', 京都府: '교토부', 大阪府: '오사카부', 兵庫県: '효고현', 奈良県: '나라현', 和歌山県: '와카야마현',
  鳥取県: '돗토리현', 島根県: '시마네현', 岡山県: '오카야마현', 広島県: '히로시마현', 山口県: '야마구치현', 徳島県: '도쿠시마현', 香川県: '가가와현', 愛媛県: '에히메현', 高知県: '고치현', 福岡県: '후쿠오카현',
  佐賀県: '사가현', 長崎県: '나가사키현', 熊本県: '구마모토현', 大分県: '오이타현', 宮崎県: '미야자키현', 鹿児島県: '가고시마현', 沖縄県: '오키나와현',
};
export const prefEn = (p: string) => PREF_EN[p] ?? p;
/** 都道府県名（中国語は漢字のまま） */
export const prefName = (p: string, lang: Lang) => (lang === 'ja' || lang === 'zh' || lang === 'zh-tw' ? p : lang === 'ko' ? PREF_KO[p] ?? p : prefEn(p));

/** 日付の範囲：Nov 20 – Dec 25, 2026 ／ 2026年11月20日～12月25日 ／ 2026년 11월 20일 ~ 12월 25일 */
export function fmtRangeL(start: string, end: string, lang: Lang): string {
  const loc = LANG_META[lang].locale;
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00+09:00`).toLocaleDateString(loc, { ...o, timeZone: 'Asia/Tokyo' });
  if (lang === 'en' || lang === 'ja') {
    return start === end ? f(start, { month: 'short', day: 'numeric', year: 'numeric' }) : `${f(start, { month: 'short', day: 'numeric' })} – ${f(end, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  const md = { month: 'long', day: 'numeric' } as const, ymd = { year: 'numeric', month: 'long', day: 'numeric' } as const;
  if (start === end) return f(start, ymd);
  return `${f(start, ymd)} ~ ${start.slice(0, 4) === end.slice(0, 4) ? f(end, md) : f(end, ymd)}`;
}
export const fmtRangeEn = (start: string, end: string) => fmtRangeL(start, end, 'en');

/** 「○分前」の外国語版 */
export function relTimeL(ts: number, now: number, lang: Lang): string {
  const tx = makeTx(lang);
  const m = Math.max(0, Math.floor((now - ts) / 60000));
  if (m < 1) return tx('just now');
  if (m < 60) return tx('{m} min ago', { m });
  const h = Math.floor(m / 60);
  return m % 60 ? tx('{h} h {m} min ago', { h, m: m % 60 }) : tx('{h} h ago', { h });
}
export const relTimeEn = (ts: number, now: number) => relTimeL(ts, now, 'en');
