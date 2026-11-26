# テーマ写真（詳細ページ上部のイメージ写真）

イベント名の言葉とジャンルから自動で選ぶ（`lib/themes.ts`）。実際のイベントの写真ではないので「写真はイメージです」を必ず表示する。
すべて Wikimedia Commons の商用利用できる写真。CC BY / CC BY-SA は作者とライセンスを写真の下に表示する（`components/ThemeThumb.tsx`）。
取り直し・追加は GitHub Actions の「theme-images」（`.github/workflows/theme-images.yml`）で行う。

| ファイル | テーマ | 作者 | ライセンス | 元のページ |
|---|---|---|---|---|
| fireworks.webp | 花火 | カイロス | パブリックドメイン | https://commons.wikimedia.org/wiki/File:Kachimai_Hanabi_Taikai_2010.jpg |
| matsuri.webp | 祭り | MIKI Yoshihito | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:The_bon_dance._(6062181215).jpg |
| illumination.webp | イルミネーション | pakku | CC BY 3.0 | https://commons.wikimedia.org/wiki/File:ブルー・コーン（Blue_cone）_-_panoramio.jpg |
| snow.webp | 雪・冬まつり | t-konno | CC BY-SA 3.0 | https://commons.wikimedia.org/wiki/File:The_66th_Sapporo_Snow_Festival_-_panoramio.jpg |
| sakura.webp | 桜・花見 | Daderot | CC0 | https://commons.wikimedia.org/wiki/File:Cherry_blossom_festival_2018_-_Yoyogi_Park_-_Tokyo,_Japan_-_DSC05535.jpg |
| autumn.webp | 紅葉 | Suicasmo | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Momiji_in_Engaku-ji_20211212.jpg |
| beach.webp | 海 | L. K. | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Tokashiku_Beach_on_Tokashiki_Island_Okinawa_2018.png |
| music.webp | 音楽フェス | Shixart1985 | CC BY 2.0 | https://commons.wikimedia.org/wiki/File:Musicians_perform_at_an_outdoor_music_festival,_captivating_the_crowd_with_energetic_guitar_riffs_and_dynamic_stage_presence.jpg |
| food.webp | グルメ | Daniel Lu | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Shiinamachi_night_festival_Toshima_Tokyo_2024_dllu.jpg |
| market.webp | マルシェ・フリマ | Asanagi | CC0 | https://commons.wikimedia.org/wiki/File:Flea_market_in_Hikarigaoka_Park_2024-04-29.jpg |
| sports.webp | スポーツ | Ludahai | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:TWN-JPN_Crowd_at_2007_Baseball_World_Cup.JPG |

写真は横1200×縦480に切り抜き・縮小した（CC BY-SA の写真は、この加工版も同じ CC BY-SA で扱う）。
