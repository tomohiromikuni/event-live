/** 現在地から施設までの距離・方角（端末の画面の中だけで計算する。位置はどこにも送らない） */
export type Geo = [number, number];

export function distM(a: Geo, b: Geo) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function dir(from: Geo, to: Geo) {
  const dy = to[0] - from[0], dx = (to[1] - from[1]) * Math.cos(from[0] * Math.PI / 180);
  const deg = (Math.atan2(dx, dy) * 180) / Math.PI;
  return ['北', '北東', '東', '南東', '南', '南西', '西', '北西'][Math.round(((deg + 360) % 360) / 45) % 8];
}
/** 「あなたから北へ約200m」（英語は trAuto で訳す） */
export function fromMeText(me: Geo, to: Geo) {
  const d = distM(me, to);
  if (d < 60) return 'あなたのすぐ近く';
  const amount = d < 1000 ? `約${Math.max(100, Math.round(d / 50) * 50)}m` : `約${(d / 1000).toFixed(1)}km`;
  return `あなたから${dir(me, to)}へ${amount}`;
}
/** 自動で作った名前の「（会場から北へ約200m）」を「（あなたから…）」に置き換える */
export function nameFromMe(name: string, me: Geo, to: Geo) {
  return /（会場から[^）]*）/.test(name) ? name.replace(/（会場から[^）]*）/, `（${fromMeText(me, to)}）`) : null;
}
