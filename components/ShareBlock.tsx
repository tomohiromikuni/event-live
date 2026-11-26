'use client';
import { useState } from 'react';
import { lineShare, xIntent } from '@/lib/share';
import { makeT, makeTx, type Lang } from '@/lib/i18n';

/**
 * 詳細ページ下部の「みんなに伝える」（X・LINE・リンクのコピーを1枠に。X の入り口は1つだけ）。
 * X に投稿するとイベント名のハッシュタグが付き、同じイベントに行く人どうしで情報交換できる（会話は X に任せる）。
 */
function record(eventId: number, channel: string) {
  fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, channel, context: 'event' }), keepalive: true }).catch(() => {});
}

export default function ShareBlock({ eventId, tag, xText, lineText, url, lang = 'ja' }: { eventId: number; tag: string | null; xText: string; lineText: string; url: string; lang?: Lang }) {
  const t = makeT(lang);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(url); } catch { window.prompt(lang === 'ja' ? 'このURLをコピーしてください' : makeTx(lang)('Copy this URL'), url); }
    setCopied(true); setTimeout(() => setCopied(false), 2000);
    record(eventId, 'copy');
  }
  return (
    <section className="share-block" aria-labelledby="share-h">
      <h2 id="share-h">{t('みんなに伝える')}</h2>
      <div className="sb-card">
        {tag && <p className="sb-tag">{t('X に投稿すると ')}<b>{tag}</b>{t(' が付き、同じイベントに行く人とつながれます')}</p>}
        <div className="sb-grid">
          <a className="sb-btn x wide" href={xIntent(xText)} target="_blank" rel="noopener noreferrer" onClick={() => record(eventId, 'x')}>
            <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" /></svg>
            {t('に投稿する')}
          </a>
          <a className="sb-btn line" href={lineShare(lineText)} target="_blank" rel="noopener noreferrer" onClick={() => record(eventId, 'line')}>{t('LINE で送る')}</a>
          <button type="button" className="sb-btn" onClick={copy}>{copied ? t('コピーしました') : t('🔗 リンクをコピー')}</button>
        </div>
        {tag && <a className="sb-sub" href={`https://x.com/search?q=${encodeURIComponent(tag)}&f=live`} target="_blank" rel="noopener noreferrer">{t('X でみんなの投稿を見る →')}</a>}
      </div>
      {/* 投稿した人へ：役に立った実感（貢献実績）。日本語版だけ（ヘッダーから移した） */}
      {lang === 'ja' && <a className="sb-me" href="/me">🙌 あなたの投稿が役に立った回数を見る</a>}
    </section>
  );
}
