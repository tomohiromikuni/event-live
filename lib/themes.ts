/**
 * 詳細ページ上部のテーマ写真（大項目ごとのイメージ写真）。
 * イベント名の言葉とジャンルから自動で選ぶ（人が選ばない）。合うテーマが無ければ写真は出さない（地図かイラスト）。
 * 写真は Wikimedia Commons の商用利用できるもの（CC0・パブリックドメイン・CC BY・CC BY-SA）。public/themes に置く。
 * 実際のイベントの写真ではないので、必ず「写真はイメージ」と表示し、CC BY 系は作者とライセンスを表示する。
 */
export type Theme = { key: string; label: string; credit: { artist: string; license: string; page: string } | null };

const C = (artist: string, license: string, file: string) => ({ artist, license, page: `https://commons.wikimedia.org/wiki/${file}` });

export const THEMES: Record<string, Theme> = {
  fireworks: { key: 'fireworks', label: '花火', credit: null }, // パブリックドメイン
  matsuri: { key: 'matsuri', label: '祭り', credit: C('MIKI Yoshihito', 'CC BY 2.0', 'File:The_bon_dance._(6062181215).jpg') },
  illumination: { key: 'illumination', label: 'イルミネーション', credit: C('pakku', 'CC BY 3.0', 'File:%E3%83%96%E3%83%AB%E3%83%BC%E3%83%BB%E3%82%B3%E3%83%BC%E3%83%B3%EF%BC%88Blue_cone%EF%BC%89_-_panoramio.jpg') },
  snow: { key: 'snow', label: '雪・冬まつり', credit: C('t-konno', 'CC BY-SA 3.0', 'File:The_66th_Sapporo_Snow_Festival_-_panoramio.jpg') },
  sakura: { key: 'sakura', label: '桜・花見', credit: null }, // CC0
  autumn: { key: 'autumn', label: '紅葉', credit: C('Suicasmo', 'CC BY-SA 4.0', 'File:Momiji_in_Engaku-ji_20211212.jpg') },
  beach: { key: 'beach', label: '海', credit: C('L. K.', 'CC BY 2.0', 'File:Tokashiku_Beach_on_Tokashiki_Island_Okinawa_2018.png') },
  music: { key: 'music', label: '音楽フェス', credit: C('Shixart1985', 'CC BY 2.0', 'File:Musicians_perform_at_an_outdoor_music_festival,_captivating_the_crowd_with_energetic_guitar_riffs_and_dynamic_stage_presence.jpg') },
  food: { key: 'food', label: 'グルメ', credit: C('Daniel Lu', 'CC BY-SA 4.0', 'File:Shiinamachi_night_festival_Toshima_Tokyo_2024_dllu.jpg') },
  market: { key: 'market', label: 'マルシェ・フリマ', credit: null }, // CC0
  sports: { key: 'sports', label: 'スポーツ', credit: C('Ludahai', 'CC BY-SA 4.0', 'File:TWN-JPN_Crowd_at_2007_Baseball_World_Cup.JPG') },
};

/** 名前の言葉（上から順に調べる。「雪まつり」は祭りより先に雪、など） */
const BY_WORD: [RegExp, string][] = [
  [/花火|hanabi/i, 'fireworks'],
  [/イルミ|ライトアップ|ルミナリエ|光の|ウインターライツ|ウィンターライツ|winter ?lights|illumination/i, 'illumination'],
  [/雪|スノー|氷|冬まつり|冬祭/, 'snow'],
  [/(桜|さくら|サクラ)(まつり|祭|フェス|の宴|ライトアップ)|花見|夜桜|観桜|千本桜|梅まつり|梅祭/, 'sakura'],
  [/紅葉|もみじ|モミジ/, 'autumn'],
  [/海水浴|ビーチ|海開き|海の日|サマービーチ/, 'beach'],
  [/マルシェ|フリマ|フリーマーケット|朝市|蚤の市|クラフト市|手づくり市|手作り市/, 'market'],
  [/グルメ|フード|ラーメン|肉フェス|餃子|カレー|屋台村|日本酒|ビール|オクトーバーフェスト/, 'food'],
  [/フェス|ライブ|音楽|ロック|ジャズ|music/i, 'music'],
  [/祭|まつり|盆踊り|おどり|踊り|神輿|山車/, 'matsuri'],
  [/マラソン|野球|サッカー|スタジアム|駅伝|ラグビー|バスケ/, 'sports'],
];
/** 言葉で決まらないときのジャンル */
const BY_GENRE: Record<string, string> = { fireworks: 'fireworks', festival: 'matsuri', music: 'music', marche: 'market', food: 'food', sports: 'sports' };

export function themeFor(e: { name: string; genre_slug?: string }): Theme | null {
  for (const [re, key] of BY_WORD) if (re.test(e.name)) return THEMES[key];
  const g = e.genre_slug ? BY_GENRE[e.genre_slug] : undefined;
  return g ? THEMES[g] : null;
}
