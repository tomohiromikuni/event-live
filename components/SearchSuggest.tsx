'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { lp, makeTx, type Lang } from '@/lib/i18n';

type Item = { slug: string; name: string; place: string; start: string; end: string; ongoing: boolean; genre: string };

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/**
 * 検索欄（予測候補つき）。打った文字に合わせて、登録済みのイベントを開催中から順に出す。
 * 候補を押すとそのイベントのページへ。Enter（候補を選んでいなければ）はいつもどおり検索結果へ。
 */
export default function SearchSuggest({ defaultValue = '', placeholder, label, lang = 'ja' }: { defaultValue?: string; placeholder: string; label: string; lang?: Lang }) {
  const en = lang !== 'ja';
  const tx = makeTx(lang);
  const [value, setValue] = useState(defaultValue);
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  function load(text: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const my = ++seq.current;
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(text)}${en ? `&lang=${lang}` : ''}`);
        const d = (await res.json()) as { items: Item[] };
        if (my === seq.current) { setItems(d.items); setActive(-1); }
      } catch { /* 候補が出ないだけ */ }
    }, 120);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function go(it: Item) { setOpen(false); router.push(`${lp(lang)}/events/${it.slug}`); }

  return (
    <div className="suggest-wrap">
      <input name="q" type="search" value={value} placeholder={placeholder} aria-label={label} autoComplete="off"
        role="combobox" aria-expanded={open && items.length > 0} aria-controls="suggest-list" aria-autocomplete="list"
        onChange={(e) => { setValue(e.target.value); setOpen(true); load(e.target.value); }}
        onFocus={() => { setOpen(true); load(value); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
          else if (e.key === 'Enter' && active >= 0 && !e.nativeEvent.isComposing) { e.preventDefault(); go(items[active]); }
          else if (e.key === 'Escape') setOpen(false);
        }} />
      {open && items.length > 0 && (
        <ul className="suggest-list" id="suggest-list" role="listbox">
          {!value.trim() && <li className="suggest-head" aria-hidden>{en ? tx('Happening now & soon') : '開催中・近日のイベント'}</li>}
          {items.map((it, i) => (
            <li key={it.slug} role="option" aria-selected={i === active}>
              <button type="button" className={`suggest-item ${i === active ? 'on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => go(it)}>
                <span className="si-name">{it.name}</span>
                <span className="si-sub">{it.ongoing ? <span className="si-live">{en ? tx('● Now') : '● 開催中'}</span> : <span>{md(it.start)}{it.end !== it.start ? `〜${md(it.end)}` : ''}</span>}{it.place && <span>・{it.place}</span>}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
