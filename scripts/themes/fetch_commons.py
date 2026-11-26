#!/usr/bin/env python3
"""
Wikimedia Commons からテーマ画像の候補を探して取る（GitHub Actions で実行）。
商用利用できるライセンス（CC0・パブリックドメイン・CC BY・CC BY-SA）で、横長・十分な大きさのものだけ。
引数：「テーマ=検索語」をいくつか。出力：<テーマ>_<番号>.jpg と meta.json（作者・ライセンス・元ページ）
"""
import json, sys, urllib.parse, urllib.request, re, html

UA = 'EVENOW-theme-images/1.0 (https://www.evenow.jp/about)'
OK = re.compile(r'^(CC0|Public domain|PD|CC BY(-SA)? ?(2\.0|2\.1|2\.5|3\.0|4\.0))', re.I)

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def strip(s):
    return html.unescape(re.sub(r'<[^>]+>', '', s or '')).strip()

meta = {}
for arg in sys.argv[1:]:
    theme, q = arg.split('=', 1)
    params = {
        'action': 'query', 'format': 'json', 'generator': 'search', 'gsrnamespace': '6',
        'gsrsearch': f'{q} filetype:bitmap', 'gsrlimit': '30', 'prop': 'imageinfo',
        'iiprop': 'url|extmetadata|size', 'iiurlwidth': '1600',
    }
    data = json.loads(get('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode(params)))
    pages = sorted((data.get('query') or {}).get('pages', {}).values(), key=lambda p: p.get('index', 99))
    n = 0
    for p in pages:
        ii = (p.get('imageinfo') or [{}])[0]
        em = ii.get('extmetadata', {})
        lic = strip(em.get('LicenseShortName', {}).get('value', ''))
        w, h = ii.get('width', 0), ii.get('height', 0)
        if not OK.match(lic) or w < 1600 or w < h * 1.3:
            continue
        n += 1
        name = f'{theme}_{n}'
        open(f'{name}.jpg', 'wb').write(get(ii['thumburl']))
        meta[name] = {'title': p['title'], 'license': lic, 'artist': strip(em.get('Artist', {}).get('value', ''))[:80],
                      'page': ii.get('descriptionurl'), 'size': f'{w}x{h}'}
        print(name, lic, '|', meta[name]['artist'], '|', p['title'])
        if n >= 4:
            break
json.dump(meta, open('meta.json', 'w'), ensure_ascii=False, indent=1)
