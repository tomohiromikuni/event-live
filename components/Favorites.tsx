'use client';
import { useEffect, useState } from 'react';
import { makeTx, type Lang } from '@/lib/i18n';

/**
 * お気に入り（この端末だけ）。会員登録なしで、ハートを押したイベントをこのブラウザに覚えておく。
 * サーバーには送らない・保存しない（端末のブラウザの保存領域だけ。消えても困らない便利機能）。
 */
type Fav = { slug: string; name: string; start: string; end: string; place: string };
const KEY = 'evenow:favs';
const read = (): Fav[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]') as Fav[]; } catch { return []; } };
const write = (v: Fav[]) => { try { localStorage.setItem(KEY, JSON.stringify(v.slice(0, 50))); } catch { /* 保存できない端末では何もしない */ } window.dispatchEvent(new Event('evenow:favs')); };
const todayJst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** 詳細ページの写真の右上のハート */
export function FavButton({ ev, lang = 'ja' }: { ev: Fav; lang?: Lang }) {
  const [on, setOn] = useState(false);
  // 初めてお気に入りに入れたときだけ「トップからいつでも見られます」と知らせる（2回目からは出さない）
  const [hint, setHint] = useState(false);
  useEffect(() => { if (!hint) return; const id = setTimeout(() => setHint(false), 4000); return () => clearTimeout(id); }, [hint]);
  useEffect(() => {
    const sync = () => setOn(read().some((f) => f.slug === ev.slug));
    sync();
    window.addEventListener('evenow:favs', sync);
    return () => window.removeEventListener('evenow:favs', sync);
  }, [ev.slug]);
  const tx = makeTx(lang);
  const label = lang === 'ja' ? (on ? 'お気に入りから外す' : 'お気に入りに追加') : tx(on ? 'Remove from favorites' : 'Add to favorites');
  return (
    <>
    <button type="button" className={`fav-btn ${on ? 'on' : ''}`} aria-pressed={on} aria-label={label} title={label}
      onClick={() => {
        const v = read().filter((f) => f.slug !== ev.slug);
        write(on ? v : [ev, ...v]);
        if (!on) { let first = false; try { first = !localStorage.getItem('evenow:fav-hint'); localStorage.setItem('evenow:fav-hint', '1'); } catch { /* 無視 */ } if (first) setHint(true); }
      }}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8 3.4 4.5 7 4.5c2.1 0 3.5 1.2 5 3 1.5-1.8 2.9-3 5-3 3.6 0 5.5 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" fill={on ? '#e11d48' : 'none'} stroke={on ? '#e11d48' : '#1c1730'} strokeWidth="2.2" strokeLinejoin="round" /></svg>
    </button>
    {hint && (
      <div className="fav-hint" role="status" onClick={() => setHint(false)}>
        <strong>{lang === 'ja' ? '❤️ お気に入りに登録しました' : `❤️ ${tx('Added to favorites')}`}</strong>
        <span>{lang === 'ja' ? 'トップページからいつでも見られます（この端末だけに保存）' : tx('You can find it on the top page anytime (saved on this device only)')}</span>
      </div>
    )}
    </>
  );
}

/** トップページの「お気に入り」（終わったイベントは出さない。1件も無ければ何も出さない） */
export function FavList({ lang = 'ja', base = '' }: { lang?: Lang; base?: string }) {
  const [favs, setFavs] = useState<Fav[]>([]);
  useEffect(() => {
    const sync = () => { const t = todayJst(); setFavs(read().filter((f) => f.end >= t)); };
    sync();
    window.addEventListener('evenow:favs', sync);
    return () => window.removeEventListener('evenow:favs', sync);
  }, []);
  if (!favs.length) return null;
  const tx = makeTx(lang);
  const t = todayJst();
  return (
    <section className="section fav-list">
      <div className="section-head"><h2>❤️ {lang === 'ja' ? 'お気に入り' : tx('Favorites')}</h2></div>
      <div className="event-list">
        {favs.map((f) => (
          <a key={f.slug} href={`${base}/events/${f.slug}`} className="event-item">
            <span className="txt">
              {f.start <= t && t <= f.end && <span className="kicker"><span className="badge live">{lang === 'ja' ? '● 開催中' : tx('● Happening now')}</span></span>}
              <span className="name">{f.name}</span>
              <span className="sub">{f.place}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
