/**
 * Google マイマップ（KML）→ イベント下書き（lib/draft.ts の形式・projection: 'geo'）への変換。
 * フォルダ名・地点名のキーワードで施設カテゴリやエリア・線の種類を決める。
 * どれにも当てはまらないものは取り込まず「読み込まなかったもの」として返す（管理者が確認できるように）。
 */
import type { Draft } from './draft';

type Rule = { re: RegExp; category: string };
/** 施設（ピン）のカテゴリ判定。上から順に最初に当てはまったもの */
const SPOT_RULES: Rule[] = [
  { re: /トイレ|ＷＣ|\bWC\b|toilet|便所/i, category: 'toilet' },
  { re: /救護|医療|AED|first ?aid/i, category: 'first_aid' },
  { re: /駐車場|パーキング|parking|駐輪/i, category: 'parking' },
  { re: /案内所|インフォメーション|information|総合案内|本部|駅/i, category: 'info' },
  { re: /休憩|休息/i, category: 'rest' },
  { re: /観覧|桟敷|会場/i, category: 'viewing' },
  { re: /入口|入場口|ゲート|gate/i, category: 'gate' },
  { re: /ステージ|stage/i, category: 'stage' },
  { re: /物販|グッズ|merch/i, category: 'merch' },
  { re: /屋台|露店|飲食|フード|キッチンカー|出店/i, category: 'food' },
];
/** エリア（多角形）の種類 */
const AREA_RULES: { re: RegExp; style: string }[] = [
  { re: /立入禁止|打ち?上げ|危険/, style: 'closed' },
  { re: /観覧|桟敷|会場/, style: 'viewing' },
  { re: /駐車/, style: 'parking' },
  { re: /屋台|露店|飲食|フード/, style: 'food' },
  { re: /ステージ/, style: 'stage' },
  { re: /物販|グッズ|ブース/, style: 'shop' },
  { re: /休憩/, style: 'rest' },
];
/** 線の種類 */
const LINE_RULES: { re: RegExp; style: string }[] = [
  { re: /規制|通行止|進入禁止/, style: 'restriction' },
  { re: /ルート|推奨|帰り|順路|ロード|導線|動線/, style: 'route' },
];

const decode = (s: string) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const tag = (src: string, name: string) => decode(src.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? '').trim();
/** KML の "lng,lat,alt lng,lat,alt ..." → [[lat, lng], ...] */
const coords = (src: string): [number, number][] => tag(src, 'coordinates').split(/\s+/).filter(Boolean)
  .map((c) => c.split(',').map(Number)).filter((c) => c.length >= 2 && c.every(Number.isFinite)).map(([ln, la]) => [la, ln]);

/** 説明文から、注意書き（※〜）や「名前:」などの付属情報を除いて短くする */
function shortNote(desc: string) {
  const plain = desc.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain.split(/※|description:|名前:|name:|種類:|説明:|緯度:/)[0].trim().slice(0, 60);
}

export type KmlResult = { draft: Draft; title: string; credit: string; skipped: { folder: string; name: string }[] };

export function kmlToDraft(kml: string, opts: { skipFolders?: RegExp } = {}): KmlResult {
  const title = tag(kml.split(/<(?:Folder|Placemark)>/)[0], 'name');
  const credit = shortNote(tag(kml.split(/<(?:Folder|Placemark)>/)[0], 'description'));
  const map: NonNullable<Draft['map']> & { spots: { category: string; name: string; note?: string; lat: number; lng: number }[] } =
    { projection: 'geo', spots: [], areas: [], lines: [] };
  const skipped: KmlResult['skipped'] = [];
  // フォルダごとに処理（フォルダが無い KML にも対応）
  const folders = [...kml.matchAll(/<Folder>([\s\S]*?)<\/Folder>/g)].map((m) => m[1]);
  const groups = folders.length ? folders : [kml];
  for (const f of groups) {
    const folder = folders.length ? tag(f.split('<Placemark>')[0], 'name') : '';
    for (const pm of f.matchAll(/<Placemark>([\s\S]*?)<\/Placemark>/g)) {
      const body = pm[1];
      const name = tag(body, 'name') || folder;
      const key = `${folder} ${name}`;
      const pts = coords(body);
      if (!pts.length || (opts.skipFolders && opts.skipFolders.test(folder))) { skipped.push({ folder, name }); continue; }
      if (body.includes('<Point>')) {
        // 地点名で判定し、だめならフォルダ名で判定（例: フォルダ「スポット」内の「案内所(駅前)」）
        // 説明文は最後の手がかり（例:「大曲体育館」の説明に「休憩所」とある）
        const desc = shortNote(tag(body, 'description'));
        const rule = SPOT_RULES.find((r) => r.re.test(name)) ?? SPOT_RULES.find((r) => r.re.test(folder)) ?? SPOT_RULES.find((r) => r.re.test(desc));
        if (!rule) { skipped.push({ folder, name }); continue; }
        map.spots.push({ category: rule.category, name: name.slice(0, 60), note: desc, lat: pts[0][0], lng: pts[0][1] });
      } else if (body.includes('<Polygon>')) {
        const rule = AREA_RULES.find((r) => r.re.test(key));
        map.areas!.push({ style: rule?.style ?? 'other_area', label: name.slice(0, 40), points: pts.slice(0, -1) });
      } else if (body.includes('<LineString>')) {
        const rule = LINE_RULES.find((r) => r.re.test(key));
        map.lines!.push({ style: rule?.style ?? 'path', label: name.slice(0, 40), points: pts });
      } else {
        skipped.push({ folder, name });
      }
    }
  }
  return { draft: { version: 1, map: map as unknown as Draft['map'] }, title, credit, skipped };
}

/** Google マイマップの URL から mid を取り出す（共有URL・viewer・edit いずれも可） */
export function myMapsId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/^(www\.)?google\.[a-z.]+$/.test(u.hostname) || !u.pathname.startsWith('/maps/d/')) return null;
    const mid = u.searchParams.get('mid');
    return mid && /^[\w-]{10,80}$/.test(mid) ? mid : null;
  } catch {
    return null;
  }
}
