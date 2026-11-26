import type { Theme } from '@/lib/themes';

/** ページ上部のテーマ写真（イメージ）。押すと会場マップへ（地図があるとき） */
export default function ThemeThumb({ theme, mapLink, lang = 'ja' }: { theme: Theme; mapLink: boolean; lang?: 'ja' | 'en' }) {
  const en = lang === 'en';
  const body = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/themes/${theme.key}.webp`} alt="" width={1200} height={480} fetchPriority="high" />
      <span className="tt-note">{en ? 'Image only' : '写真はイメージです'}</span>
      {mapLink && <span className="mt-open">{en ? '🗺️ Venue map' : '🗺️ 会場マップを見る'}</span>}
    </>
  );
  return (
    <figure className="event-thumb theme-thumb">
      {mapLink ? <a href="#map" aria-label={en ? 'Venue map' : '会場マップを見る'}>{body}</a> : body}
      {theme.credit && (
        <figcaption className="tt-credit">
          {en ? 'Photo: ' : '写真：'}<a href={theme.credit.page} target="_blank" rel="noopener noreferrer">{theme.credit.artist}</a>／{theme.credit.license}
        </figcaption>
      )}
    </figure>
  );
}
