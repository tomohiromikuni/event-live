export const REGIONS: { name: string; prefs: string[] }[] = [
  { name: '北海道・東北', prefs: ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県'] },
  { name: '関東', prefs: ['茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県'] },
  { name: '中部', prefs: ['新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県'] },
  { name: '近畿', prefs: ['三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県'] },
  { name: '中国・四国', prefs: ['鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県'] },
  { name: '九州・沖縄', prefs: ['福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'] },
];
export const PREFECTURES = REGIONS.flatMap((r) => r.prefs);

/** 詳細ページの基本情報項目（ジャンルごとに表示順・取捨を設定可能） */
export const INFO_FIELDS: { key: string; label: string }[] = [
  { key: 'time_text', label: '開催時間' },
  { key: 'venue', label: '開催場所' },
  { key: 'access', label: 'アクセス' },
  { key: 'nearest_station', label: '最寄り駅' },
  { key: 'traffic_info', label: '交通規制' },
  { key: 'parking_info', label: '駐車場' },
  { key: 'shuttle_info', label: 'シャトルバス' },
  { key: 'toilet_info', label: 'トイレ' },
  { key: 'food_info', label: '飲食エリア' },
  { key: 'ticket_info', label: '入場料・チケット' },
  { key: 'organizer', label: '主催者' },
  { key: 'official_url', label: '公式サイト' },
  { key: 'extra_info', label: 'ジャンル別情報' },
];
