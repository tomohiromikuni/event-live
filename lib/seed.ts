import type { Q } from './db';
import { addDays, todayJST, weekendRange } from './dates';
import { shapeStyle } from './shapes';

/**
 * マスタデータとサンプルイベントを投入する。
 * サンプルイベントはすべて架空のもので is_sample=1 を付け、名称にも【サンプル】を付ける。
 * 開催日は投入時点の日付を基準に相対的に設定する（常に「今日開催」のデモができるように）。
 */
const REPORT_TYPES = [
  { slug: 'wait', name: '待ち時間', options: [
    { value: 'none', label: '待ち時間なし', level: 0 },
    { value: '5min', label: '5分程度', level: 1 },
    { value: '10min', label: '10分程度', level: 2 },
    { value: '20min', label: '20分以上', level: 3 },
  ] },
  { slug: 'parking', name: '駐車場の空き', options: [
    { value: 'available', label: '空きあり', level: 0 },
    { value: 'few', label: '残りわずか', level: 1 },
    { value: 'full', label: '満車', level: 3 },
    { value: 'queue', label: '入庫待ちあり', level: 3 },
  ] },
  { slug: 'crowd', name: '混雑度', options: [
    { value: 'empty', label: '空いている', level: 0 },
    { value: 'some', label: 'やや混雑', level: 1 },
    { value: 'busy', label: '混雑', level: 2 },
    { value: 'packed', label: '非常に混雑', level: 3 },
  ] },
  { slug: 'traffic', name: '交通・道路', options: [
    { value: 'smooth', label: 'スムーズ', level: 0 },
    { value: 'slow', label: 'やや渋滞', level: 1 },
    { value: 'jam', label: '渋滞', level: 2 },
    { value: 'closed', label: '通行止め', level: 4 },
  ] },
  { slug: 'merch', name: '物販の待ち時間', options: [
    { value: 'none', label: '待ち時間なし', level: 0 },
    { value: '10min', label: '10分程度', level: 1 },
    { value: '30min', label: '30分程度', level: 2 },
    { value: '60min', label: '1時間以上', level: 3 },
    { value: 'soldout', label: '売り切れ', level: 4 },
  ] },
];

const CATEGORIES = [
  { slug: 'gate', name: '入場口', icon: '🚪', color: '#2563eb', rt: 'crowd' },
  { slug: 'toilet', name: 'トイレ', icon: '🚻', color: '#0891b2', rt: 'wait' },
  { slug: 'food', name: '飲食・屋台', icon: '🍜', color: '#ea580c', rt: 'wait' },
  { slug: 'parking', name: '駐車場', icon: '🅿️', color: '#4f46e5', rt: 'parking' },
  { slug: 'traffic', name: '交通・道路', icon: '🚗', color: '#475569', rt: 'traffic' },
  { slug: 'stage', name: 'ステージ', icon: '🎤', color: '#c026d3', rt: 'crowd' },
  { slug: 'merch', name: '物販', icon: '🛍️', color: '#db2777', rt: 'merch' },
  { slug: 'viewing', name: '観覧エリア', icon: '🎆', color: '#7c3aed', rt: 'crowd' },
  { slug: 'rest', name: '休憩所', icon: '🪑', color: '#65a30d', rt: 'crowd' },
  { slug: 'first_aid', name: '救護所', icon: '⛑️', color: '#dc2626', rt: null },
  { slug: 'info', name: '案内所・その他', icon: 'ℹ️', color: '#64748b', rt: null },
];

const ALL_INFO = 'time_text,venue,access,nearest_station,traffic_info,parking_info,ticket_info,organizer,official_url,extra_info';
const GENRES = [
  { slug: 'fireworks', name: '花火大会', icon: '🎆', color: '#7c3aed', cats: ['viewing', 'gate', 'toilet', 'food', 'parking', 'traffic', 'first_aid', 'info'],
    info: 'time_text,venue,traffic_info,access,nearest_station,parking_info,ticket_info,extra_info,organizer,official_url' },
  { slug: 'festival', name: '祭り・地域行事', icon: '🏮', color: '#dc2626', cats: ['food', 'toilet', 'stage', 'rest', 'parking', 'traffic', 'first_aid', 'info'], info: ALL_INFO },
  { slug: 'music', name: '音楽フェス・ライブ', icon: '🎸', color: '#c026d3', cats: ['gate', 'stage', 'merch', 'food', 'toilet', 'parking', 'rest', 'first_aid', 'info'],
    info: 'time_text,venue,ticket_info,extra_info,access,nearest_station,parking_info,traffic_info,organizer,official_url' },
  { slug: 'marche', name: 'マルシェ・フリマ', icon: '🧺', color: '#16a34a', cats: ['food', 'toilet', 'parking', 'rest', 'info'], info: ALL_INFO },
  { slug: 'food', name: 'グルメ・フードフェス', icon: '🍔', color: '#ea580c', cats: ['food', 'gate', 'toilet', 'rest', 'parking', 'first_aid', 'info'], info: ALL_INFO },
  { slug: 'expo', name: '展示会・見本市', icon: '🏢', color: '#0284c7', cats: ['gate', 'toilet', 'food', 'rest', 'parking', 'info'], info: ALL_INFO },
  { slug: 'anime_game', name: 'アニメ・ゲーム', icon: '🎮', color: '#9333ea', cats: ['gate', 'merch', 'stage', 'toilet', 'food', 'rest', 'first_aid', 'info'], info: ALL_INFO },
  { slug: 'sports', name: 'スポーツ', icon: '⚽', color: '#0d9488', cats: ['gate', 'toilet', 'food', 'merch', 'parking', 'traffic', 'first_aid', 'info'], info: ALL_INFO },
  { slug: 'local', name: '自治体・地域イベント', icon: '🏛️', color: '#2563eb', cats: ['gate', 'toilet', 'food', 'parking', 'rest', 'info'], info: ALL_INFO },
  { slug: 'seasonal', name: '季節イベント', icon: '🍁', color: '#d97706', cats: ['gate', 'toilet', 'food', 'parking', 'rest', 'info'], info: ALL_INFO },
  { slug: 'other', name: 'その他', icon: '🎉', color: '#64748b', cats: ['gate', 'toilet', 'food', 'parking', 'info'], info: ALL_INFO },
];

type SpotSeed = [cat: string, name: string, dy: number, dx: number, note?: string];
type EventSeed = {
  slug: string; name: string; genre: string; pref: string; city: string; venue: string; address: string;
  lat: number; lng: number; zoom: number; start: string; end: string; time: string; summary: string;
  organizer: string; access: string; station: string; traffic: string; parking: string; ticket: string; extra: string;
  status?: string; statusNote?: string; featured?: number; spots: SpotSeed[];
  reports?: [spotIdx: number, value: string, minutesAgo: number][];
};

/** マスタ（ジャンル・カテゴリ・投稿選択肢）とサンプルイベントを投入する（初回のみ） */
export async function seed(q: Q) {
  const rtIds: Record<string, number> = {};
  for (const r of REPORT_TYPES) {
    rtIds[r.slug] = (await q<{ id: number }>('INSERT INTO report_types (slug, name, options) VALUES ($1, $2, $3) RETURNING id',
      [r.slug, r.name, JSON.stringify(r.options)]))[0].id;
  }
  const catIds: Record<string, number> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    catIds[c.slug] = (await q<{ id: number }>('INSERT INTO spot_categories (slug, name, icon, color, report_type_id, sort) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [c.slug, c.name, c.icon, c.color, c.rt ? rtIds[c.rt] : null, i]))[0].id;
  }
  for (const [i, gn] of GENRES.entries()) {
    const id = (await q<{ id: number }>('INSERT INTO genres (slug, name, icon, color, info_fields, sort) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [gn.slug, gn.name, gn.icon, gn.color, gn.info, i]))[0].id;
    for (const c of gn.cats) await q('INSERT INTO genre_categories (genre_id, category_id) VALUES ($1, $2)', [id, catIds[c]]);
  }
  await seedSamples(q);
}

/**
 * サンプルイベントを（再）投入する。既存のサンプル（is_sample=1）は削除してから、今日を基準にした日程で作り直す。
 * 管理画面の「サンプルデータをリセット」からも呼ばれる。
 */
export async function seedSamples(q: Q) {
  const now = Date.now();
  const today = todayJST(now);
  const [sat, sun] = weekendRange(today);
  // 今日が週末の場合でも「今後」のデモが成立するよう、来週末も用意
  const nextSat = addDays(sat, 7);

  await q('DELETE FROM events WHERE is_sample = 1');
  const genreIds = Object.fromEntries((await q<{ id: number; slug: string }>('SELECT id, slug FROM genres')).map((r) => [r.slug, r.id]));
  const catIds = Object.fromEntries((await q<{ id: number; slug: string }>('SELECT id, slug FROM spot_categories')).map((r) => [r.slug, r.id]));

  const events: EventSeed[] = [
    {
      slug: 'sample-minatogawa-hanabi', name: '【サンプル】みなと川 冬花火大会', genre: 'fireworks',
      pref: '東京都', city: '江東区', venue: 'みなと川河川敷（架空）', address: '東京都江東区（サンプル住所）',
      lat: 35.6655, lng: 139.8195, zoom: 15, start: today, end: today, time: '18:30〜19:30（打ち上げ）',
      summary: '冬の夜空に約3,000発の花火を打ち上げる、河川敷の花火大会です。※これは動作確認用の架空のイベントです。',
      organizer: 'みなと川花火実行委員会（架空）', access: '各線「みなと川駅」から徒歩10分（架空）', station: 'みなと川駅（架空）',
      traffic: '17:00〜21:00 河川敷沿いの道路で車両通行止め（架空）', parking: '会場周辺に臨時駐車場あり（台数限定）',
      ticket: '観覧無料／有料観覧席 3,000円（架空）', extra: '打ち上げ数: 約3,000発\n雨天時: 翌日に順延', featured: 1,
      spots: [
        ['viewing', '河川敷 観覧エリアA', 0.0006, -0.0012], ['viewing', '河川敷 観覧エリアB', 0.0009, 0.0011],
        ['gate', '北側 入場口', -0.0014, -0.0018], ['gate', '東側 入場口', -0.0008, 0.0024],
        ['toilet', '仮設トイレ①（北口付近）', -0.001, -0.0009], ['toilet', '仮設トイレ②（東口付近）', -0.0004, 0.0019],
        ['food', '屋台エリア', -0.0018, 0.0002, '約30店舗'], ['parking', '臨時駐車場（第1）', -0.0032, -0.0028, '約200台'],
        ['traffic', '河川敷通り（交通規制区間）', -0.0024, 0.0008], ['first_aid', '救護所', -0.0015, 0.0012],
        ['info', '総合案内所', -0.0012, -0.0003],
      ],
      reports: [[0, 'busy', 4], [1, 'some', 12], [2, 'packed', 6], [4, '10min', 3], [5, 'none', 41], [6, '5min', 9],
        [7, 'few', 15], [8, 'jam', 22], [3, 'empty', 130]],
    },
    {
      slug: 'sample-green-field-fes', name: '【サンプル】グリーンフィールド・ミュージックフェス', genre: 'music',
      pref: '千葉県', city: '千葉市', venue: 'ベイサイド公園特設ステージ（架空）', address: '千葉県千葉市美浜区（サンプル住所）',
      lat: 35.6425, lng: 140.0365, zoom: 16, start: today, end: addDays(today, 1), time: '開場 10:00／開演 11:00〜21:00',
      summary: '2日間で約40組のアーティストが出演する野外音楽フェス。2つのステージと物販エリアがあります。※動作確認用の架空イベントです。',
      organizer: 'グリーンフィールド実行委員会（架空）', access: 'ベイサイド駅から徒歩8分、シャトルバスあり（架空）', station: 'ベイサイド駅（架空）',
      traffic: '', parking: '一般駐車場なし。公共交通機関をご利用ください（架空）',
      ticket: '1日券 12,000円／2日通し券 22,000円（架空）', extra: '出演: 約40組（架空）\n再入場: リストバンド提示で可', featured: 1,
      spots: [
        ['gate', 'メインゲート', -0.0016, -0.0006], ['stage', 'SUNステージ', 0.0012, -0.0012], ['stage', 'SEAステージ', 0.0009, 0.0018],
        ['merch', 'オフィシャルグッズ売り場', -0.0009, 0.0004], ['food', 'フードエリア', -0.0001, 0.0009],
        ['toilet', 'トイレ（ゲート横）', -0.0013, 0.0002], ['toilet', 'トイレ（SEAステージ裏）', 0.0016, 0.0024],
        ['rest', '休憩テント', 0.0003, -0.0016], ['first_aid', '救護テント', -0.0004, -0.0008], ['info', 'インフォメーション', -0.0011, -0.0011],
      ],
      reports: [[0, 'some', 7], [1, 'busy', 2], [3, '60min', 5], [3, '30min', 35], [4, '10min', 11], [5, '20min', 3], [6, '5min', 18]],
    },
    {
      slug: 'sample-sakura-dori-aki-matsuri', name: '【サンプル】さくら通り 秋祭り', genre: 'festival',
      pref: '京都府', city: '京都市', venue: 'さくら通り商店街周辺（架空）', address: '京都府京都市（サンプル住所）',
      lat: 35.0045, lng: 135.7675, zoom: 17, start: sat, end: sun, time: '11:00〜20:00',
      summary: '商店街を中心に神輿巡行や屋台が並ぶ地域のお祭りです。※動作確認用の架空イベントです。',
      organizer: 'さくら通り商店街振興会（架空）', access: '最寄り駅から徒歩3分（架空）', station: 'さくら通り駅（架空）',
      traffic: '期間中 11:00〜20:00 さくら通りは歩行者天国', parking: '', ticket: '入場無料', extra: '神輿巡行: 土曜 14:00〜（架空）',
      spots: [
        ['food', '屋台通り（北）', 0.0006, -0.0004], ['food', '屋台通り（南）', -0.0006, 0.0003], ['stage', '広場ステージ', 0.0001, 0.0009],
        ['toilet', '公衆トイレ', -0.0003, -0.0008], ['rest', '休憩所（集会所）', 0.0009, 0.0006], ['first_aid', '救護所', -0.0009, -0.0003],
        ['traffic', 'さくら通り（歩行者天国）', 0.0, -0.0001],
      ],
    },
    {
      slug: 'sample-weekend-farmers-marche', name: '【サンプル】ウィークエンド・ファーマーズマルシェ', genre: 'marche',
      pref: '大阪府', city: '大阪市', venue: '中之島ひろば（架空）', address: '大阪府大阪市（サンプル住所）',
      lat: 34.6925, lng: 135.5035, zoom: 17, start: nextSat, end: nextSat, time: '10:00〜15:00',
      summary: '近郊農家の野菜や加工品、キッチンカーが集まるマルシェです。※動作確認用の架空イベントです。',
      organizer: 'ファーマーズマルシェ事務局（架空）', access: '駅から徒歩5分（架空）', station: '', traffic: '',
      parking: '近隣のコインパーキングをご利用ください', ticket: '入場無料', extra: '出店数: 約50店（架空）',
      spots: [
        ['food', 'キッチンカーエリア', 0.0004, 0.0006], ['food', '農産物ブース', -0.0003, -0.0002], ['toilet', 'トイレ', 0.0008, -0.0007],
        ['parking', '提携コインパーキング', -0.0012, 0.0011], ['rest', '飲食スペース', 0.0, 0.0012], ['info', '本部テント', -0.0006, 0.0003],
      ],
    },
    {
      slug: 'sample-hakata-craft-food-fes', name: '【サンプル】クラフトフードフェス', genre: 'food',
      pref: '福岡県', city: '福岡市', venue: '天神セントラル広場（架空）', address: '福岡県福岡市（サンプル住所）',
      lat: 33.5905, lng: 130.3995, zoom: 17, start: sat, end: sun, time: '11:00〜21:00',
      summary: '全国のご当地グルメとクラフトビールが集まるフードフェス。※動作確認用の架空イベントです。',
      organizer: 'クラフトフードフェス実行委員会（架空）', access: '駅から徒歩2分（架空）', station: '', traffic: '',
      parking: '', ticket: '入場無料（飲食代別）', extra: '',
      status: 'canceled', statusNote: '荒天が予想されるため、今回の開催は中止となりました（架空の中止情報です）。',
      spots: [
        ['gate', '入場口', -0.0007, 0.0], ['food', 'グルメブース', 0.0003, -0.0004], ['toilet', 'トイレ', 0.0006, 0.0006],
      ],
    },
  ];

  for (const e of events) {
    const genreId = genreIds[e.genre] ?? genreIds.other;
    if (!genreId) continue;
    const [{ id: eid }] = await q<{ id: number }>(`INSERT INTO events (slug, name, genre_id, prefecture, city, venue_name, address, lat, lng, zoom,
      start_date, end_date, time_text, summary, organizer, official_url, access, nearest_station, traffic_info, parking_info,
      ticket_info, extra_info, status, status_note, is_sample, is_featured, source_url, source_checked_at, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, '', $16, $17, $18, $19, $20, $21, $22, $23, 1, $24, '', $25, $26, $26)
      ON CONFLICT (slug) DO NOTHING RETURNING id`,
      [e.slug, e.name, genreId, e.pref, e.city, e.venue, e.address, e.lat, e.lng, e.zoom,
        e.start, e.end, e.time, e.summary, e.organizer, e.access, e.station, e.traffic, e.parking, e.ticket, e.extra,
        e.status ?? 'scheduled', e.statusNote ?? '', e.featured ?? 0, today, now]).then((r) => (r.length ? r : [{ id: 0 }]));
    if (!eid) continue; // 同じスラッグの実イベントがある場合は作らない
    const spotIds: ({ id: number; cat: string } | null)[] = [];
    for (const [i, [cat, name, dy, dx, note]] of e.spots.entries()) {
      if (!catIds[cat]) { spotIds.push(null); continue; }
      const [{ id }] = await q<{ id: number }>('INSERT INTO spots (event_id, category_id, name, note, lat, lng, sort) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [eid, catIds[cat], name, note ?? '', e.lat + dy * K, e.lng + dx * K, i]);
      spotIds.push({ id, cat });
    }
    for (const [i, [idx, value, ago]] of (e.reports ?? []).entries()) {
      const sp = spotIds[idx];
      if (!sp) continue;
      const rtSlug = CATEGORIES.find((c) => c.slug === sp.cat)!.rt!;
      const opt = REPORT_TYPES.find((r) => r.slug === rtSlug)!.options.find((o) => o.value === value)!;
      await q(`INSERT INTO reports (event_id, spot_id, value, label, level, client_id, ip_hash, created_at) VALUES ($1, $2, $3, $4, $5, $6, 'seed', $7)`,
        [eid, sp.id, opt.value, opt.label, opt.level, `seed-${i}`, now - ago * 60000]);
    }
    for (const [i, [style, label, pts]] of (SAMPLE_SHAPES[e.slug] ?? []).entries()) {
      const coords = pts.map(([dy, dx]) => [+(e.lat + dy * K).toFixed(6), +(e.lng + dx * K).toFixed(6)]);
      await q('INSERT INTO map_shapes (event_id, kind, style, label, coords, sort) VALUES ($1, $2, $3, $4, $5, $6)',
        [eid, shapeStyle(style).kind, style, label, JSON.stringify(coords), i]);
    }
  }
}

/** サンプル会場の広さの倍率（相対座標に掛ける） */
const K = 2;

/** サンプルの簡易マップ（会場中心からの相対座標 [dy, dx]） */
type R = [number, number];
const rect = (n: number, w: number, s: number, e: number): R[] => [[n, w], [n, e], [s, e], [s, w]];
const SAMPLE_SHAPES: Record<string, [style: string, label: string, pts: R[]][]> = {
  'sample-minatogawa-hanabi': [
    ['closed', '打ち上げ場所（立入禁止）', rect(0.0026, -0.0025, 0.0019, 0.0023)],
    ['viewing', '観覧エリアA', rect(0.0012, -0.0024, 0.0001, -0.0002)],
    ['viewing', '観覧エリアB', rect(0.0015, 0.0001, 0.0003, 0.0022)],
    ['food', '屋台エリア', rect(-0.0015, -0.0008, -0.0021, 0.0012)],
    ['parking', '臨時駐車場', rect(-0.0028, -0.0034, -0.0036, -0.0022)],
    ['restriction', '車両通行止め 17:00〜21:00', [[-0.0024, -0.0036], [-0.0024, 0.003]]],
    ['route', '帰りの推奨ルート', [[-0.0014, -0.0018], [-0.0022, -0.0016], [-0.0032, -0.0012]]],
  ],
  'sample-green-field-fes': [
    ['stage', 'SUNステージ前', rect(0.0018, -0.002, 0.0006, -0.0004)],
    ['stage', 'SEAステージ前', rect(0.0015, 0.001, 0.0003, 0.0026)],
    ['shop', '物販エリア', rect(-0.0006, 0.0, -0.0012, 0.0008)],
    ['food', 'フードエリア', rect(0.0002, 0.0004, -0.0004, 0.0013)],
    ['path', 'メイン通路', [[-0.0016, -0.0006], [-0.0005, -0.0004], [0.0004, 0.0002], [0.0006, 0.0012]]],
  ],
  'sample-sakura-dori-aki-matsuri': [
    ['food', '屋台通り', rect(0.0009, -0.0006, -0.0009, -0.0002)],
    ['stage', '広場', rect(0.0004, 0.0005, -0.0002, 0.0013)],
    ['restriction', '歩行者天国（11:00〜20:00）', [[0.0012, -0.0001], [-0.0012, -0.0001]]],
  ],
};
