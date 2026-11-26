'use client';
import { useEffect } from 'react';

/** 言語メニューを開いたあと、メニューの外をタップしたら閉じる（Esc キーでも閉じる） */
export default function LangMenuCloser() {
  useEffect(() => {
    const close = (e: Event) => {
      document.querySelectorAll<HTMLDetailsElement>('details.lang-menu[open]').forEach((d) => {
        if (e.type === 'keydown' ? (e as KeyboardEvent).key === 'Escape' : !d.contains(e.target as Node)) d.open = false;
      });
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, []);
  return null;
}
