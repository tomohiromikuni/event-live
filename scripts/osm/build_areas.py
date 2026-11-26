#!/usr/bin/env python3
"""
日本全国の OpenStreetMap から、会場になりやすい「公園・広場・競技場・イベント会場」などの外形を抜き出し、
0.1度ごとのファイル（a/<lat10>_<lng10>.json）に分ける。会場マップで「会場の範囲」を薄く囲うのに使う。
出力の1行：[ID, 名前, 面積(m²), [[緯度,経度], ...（最大40点）]]
データ © OpenStreetMap contributors（ODbL）
"""
import json, math, os, sys

def ring_of(geom):
    t, c = geom['type'], geom['coordinates']
    if t == 'Polygon':
        return c[0]
    if t == 'MultiPolygon':
        return max((p[0] for p in c), key=len)
    return None

def area_m2(ring):
    lat0 = math.radians(ring[0][1]); k = 111320
    a = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]; x2, y2 = ring[(i + 1) % len(ring)]
        a += (x1 * math.cos(lat0) * k) * (y2 * k) - (x2 * math.cos(lat0) * k) * (y1 * k)
    return abs(a / 2)

def main(out):
    tiles, seen, n = {}, set(), 0
    for line in sys.stdin:
        line = line.strip().lstrip('\x1e')
        if not line:
            continue
        f = json.loads(line)
        p = f.get('properties') or {}
        key = f"{p.get('@type')}/{p.get('@id')}"
        if key in seen:
            continue
        seen.add(key)
        ring = ring_of(f['geometry'])
        if not ring or len(ring) < 4:
            continue
        a = area_m2(ring)
        if a < 2000 or a > 5_000_000:
            continue
        step = max(1, math.ceil(len(ring) / 40))
        pts = [[round(y, 5), round(x, 5)] for x, y in ring[::step]]
        cy = sum(q[0] for q in pts) / len(pts); cx = sum(q[1] for q in pts) / len(pts)
        if not (20 <= cy <= 46 and 122 <= cx <= 154):
            continue
        name = (p.get('name:ja') or p.get('name') or '').strip()[:40]
        tiles.setdefault(f'{math.floor(cy * 10)}_{math.floor(cx * 10)}', []).append([key, name, round(a), pts])
        n += 1
    os.makedirs(os.path.join(out, 'a'), exist_ok=True)
    for k, rows in tiles.items():
        with open(os.path.join(out, 'a', f'{k}.json'), 'w') as fp:
            json.dump(rows, fp, ensure_ascii=False, separators=(',', ':'))
    meta_path = os.path.join(out, 'meta.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    meta['area_tiles'] = sorted(tiles); meta['area_count'] = n
    json.dump(meta, open(meta_path, 'w'), separators=(',', ':'))
    print(f'areas={n} tiles={len(tiles)}', file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1])
