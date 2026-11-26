import KindIcon from '@/components/Icon';
import type { Category, Spot } from '@/lib/types';
import { PUBLIC_SPOT_CATS } from '@/lib/shapes';

/**
 * ページ上部の小さな会場マップ（画像）。押すと下の会場マップへ移動する。
 * 背景は国土地理院の淡色地図タイル（出典を表示）、点はイベナウの地点（トイレ・駐車場など）。JavaScript なしで描く。
 * 公式サイトの写真・ガイドマップは使わない（著作権に配慮）。
 */
const TILE = 'https://cyberjapandata.gsi.go.jp/xyz/pale';
const H = 150;        // 表示の高さ（px）
const FIT_W = 330;    // この幅・高さに地点が収まるズームを選ぶ（スマホ幅を想定）
const FIT_H = 110;

function px(lat: number, lng: number, z: number): [number, number] {
  const n = 256 * 2 ** z;
  const s = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

export default function MapThumb({ center, spots, categories, genre }: {
  center: [number, number]; spots: Spot[]; categories: Category[]; genre: { name: string; slug: string; icon: string };
}) {
  const cat = new Map(categories.map((c) => [c.id, c]));
  const pts = spots.filter((s) => !s.generic && PUBLIC_SPOT_CATS.includes(cat.get(s.category_id)?.slug ?? ''));
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const mid: [number, number] = pts.length ? [(Math.min(...lats) + Math.max(...lats)) / 2, (Math.min(...lngs) + Math.max(...lngs)) / 2] : center;
  // 地点が全部入る、いちばん大きいズーム（13〜17）
  let z = 17;
  for (; z > 13; z--) {
    if (!pts.length) { z = 16; break; }
    const a = px(Math.max(...lats), Math.min(...lngs), z), b = px(Math.min(...lats), Math.max(...lngs), z);
    if (b[0] - a[0] <= FIT_W && b[1] - a[1] <= FIT_H) break;
  }
  const [cx, cy] = px(mid[0], mid[1], z);
  const tx = Math.floor(cx / 256), ty = Math.floor(cy / 256);
  const tiles: { x: number; y: number }[] = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) tiles.push({ x: tx + dx, y: ty + dy });
  return (
    <a href="#map" className="event-thumb map-thumb" aria-label="会場マップを見る">
      <div className="mt-layer" style={{ height: H }}>
        <div className="mt-origin">
          {tiles.map((t) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${t.x}-${t.y}`} src={`${TILE}/${z}/${t.x}/${t.y}.png`} alt="" width={256} height={256}
              style={{ left: t.x * 256 - cx, top: t.y * 256 - cy }} />
          ))}
          {pts.slice(0, 40).map((p) => {
            const c = cat.get(p.category_id)!;
            const [x, y] = px(p.lat, p.lng, z);
            return <span key={p.id} className="mt-pin" style={{ left: x - cx, top: y - cy, background: c.color }} title={c.name} />;
          })}
        </div>
      </div>
      <span className="thumb-genre"><KindIcon kind="genre" slug={genre.slug} emoji={genre.icon} size={14} strokeWidth={2.4} /> {genre.name}</span>
      <span className="mt-open">🗺️ 会場マップを見る</span>
      <span className="mt-credit">国土地理院</span>
    </a>
  );
}
