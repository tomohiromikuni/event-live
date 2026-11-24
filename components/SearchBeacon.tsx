'use client';
import { useEffect } from 'react';

/**
 * 検索結果が表示されたら、検索語と件数を記録する（管理画面のアナリティクス用）。
 * 同じタブで同じ言葉を続けて開き直した分（ジャンルの切り替えなど）は数えない。
 */
export default function SearchBeacon({ q, count }: { q: string; count: number }) {
  useEffect(() => {
    const key = `evl_sq:${q}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* 記録できない環境でも検索は続ける */ }
    fetch('/api/searches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q, count }), keepalive: true }).catch(() => {});
  }, [q, count]);
  return null;
}
