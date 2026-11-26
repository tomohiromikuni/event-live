#!/usr/bin/env python3
"""
日本全国の OpenStreetMap から「トイレ・駐車場」だけを抜き出し、0.1度ごとの小さなファイル（タイル）に分ける。
GitHub Actions（.github/workflows/osm-data.yml）で月1回実行し、osm-data ブランチに置く。
イベナウは会場の周りのタイルだけを読み込む（混雑しがちな公開の Overpass サーバーに頼らないため）。

入力：osmium export -f geojsonseq の出力（標準入力）
出力：<out>/t/<lat10>_<lng10>.json（[種類, ID, 緯度, 経度, 名前, 有料/無料, 台数, 車いす] の配列）と <out>/meta.json
データ © OpenStreetMap contributors（ODbL）
"""
import json, os, sys, time

EXCLUDE_ACCESS = {'private', 'no', 'customers', 'permissive_members', 'staff', 'delivery'}
EXCLUDE_PARKING = {'street_side', 'lane'}

def area_m2(ring):
    import math
    lat0 = math.radians(ring[0][1]); k = 111320
    a = 0.0
    for i in range(len(ring)):
        x1, y1 = ring[i]; x2, y2 = ring[(i + 1) % len(ring)]
        a += (x1 * math.cos(lat0) * k) * (y2 * k) - (x2 * math.cos(lat0) * k) * (y1 * k)
    return abs(a / 2)

def center(geom):
    t, c = geom['type'], geom['coordinates']
    if t == 'Point':
        return c[1], c[0]
    ring = c[0] if t == 'Polygon' else c[0][0] if t == 'MultiPolygon' else None
    if not ring:
        return None
    pts = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    return sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)

def main(out):
    tiles, seen, n = {}, set(), 0
    for line in sys.stdin:
        line = line.strip().lstrip('\x1e')
        if not line:
            continue
        f = json.loads(line)
        p = f.get('properties') or {}
        am = p.get('amenity')
        if am not in ('toilets', 'parking'):
            continue
        if p.get('access', '') in EXCLUDE_ACCESS:
            continue
        if am == 'parking' and p.get('parking', '') in EXCLUDE_PARKING:
            continue
        typ, oid = p.get('@type', 'node'), p.get('@id')
        key_id = f'{typ}/{oid}'
        if oid is None or key_id in seen:
            continue
        seen.add(key_id)
        c = center(f['geometry'])
        if not c:
            continue
        lat, lng = c
        if not (20 <= lat <= 46 and 122 <= lng <= 154):
            continue
        name = (p.get('name:ja') or p.get('name') or '').strip()[:60]
        cap = p.get('capacity', '')
        # 追加の情報（あるものだけ）：駐車場＝種類・運営・広さ・階数、トイレ＝おむつ替え・男女共用
        extra = {}
        if am == 'parking':
            pk = p.get('parking', '')
            if pk in ('multi-storey', 'underground', 'surface', 'rooftop'):
                extra['k'] = {'multi-storey': 'm', 'underground': 'u', 'surface': 's', 'rooftop': 'm'}[pk]
            op = (p.get('operator:ja') or p.get('operator') or p.get('brand') or '').strip()
            if op:
                extra['o'] = op[:30]
            if f['geometry']['type'] in ('Polygon', 'MultiPolygon'):
                ring = f['geometry']['coordinates'][0] if f['geometry']['type'] == 'Polygon' else f['geometry']['coordinates'][0][0]
                a = area_m2(ring)
                if a > 0:
                    extra['a'] = int(a)
            lv = p.get('building:levels') or p.get('parking:levels') or ''
            if str(lv).isdigit():
                extra['l'] = int(lv)
        else:
            if p.get('changing_table') == 'yes' or p.get('diaper') == 'yes':
                extra['c'] = 1
            if p.get('unisex') == 'yes':
                extra['x'] = 1
        row = [('t' if am == 'toilets' else 'p') + typ[0], int(oid), round(lat, 6), round(lng, 6), name,
               p.get('fee', '') if am == 'parking' else '', cap if am == 'parking' and cap.isdigit() else '',
               p.get('wheelchair', '') if am == 'toilets' else '', extra or '']
        while row and row[-1] == '':
            row.pop()
        tiles.setdefault(f'{int(lat * 10 // 1)}_{int(lng * 10 // 1)}', []).append(row)
        n += 1
    os.makedirs(os.path.join(out, 't'), exist_ok=True)
    for k, rows in tiles.items():
        with open(os.path.join(out, 't', f'{k}.json'), 'w') as fp:
            json.dump(rows, fp, ensure_ascii=False, separators=(',', ':'))
    meta = {'built': time.strftime('%Y-%m-%d'), 'count': n, 'source': 'OpenStreetMap (Geofabrik japan-latest)',
            'license': '© OpenStreetMap contributors, ODbL 1.0', 'tiles': sorted(tiles)}
    with open(os.path.join(out, 'meta.json'), 'w') as fp:
        json.dump(meta, fp, separators=(',', ':'))
    print(f'facilities={n} tiles={len(tiles)}', file=sys.stderr)

if __name__ == '__main__':
    main(sys.argv[1])
