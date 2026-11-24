'use client';
import { useEffect, useState } from 'react';
import { lineShare, xIntent } from '@/lib/share';

type Props = {
  eventId: number;
  /** X・LINE に渡す本文（URL・ハッシュタグ込み） */
  xText: string;
  lineText: string;
  /** コピー用のURL */
  url: string;
  context?: 'event' | 'live';
  title?: string;
  compact?: boolean;
};

function record(eventId: number, channel: string, context: string) {
  // 集計用（失敗しても共有の邪魔はしない）
  fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId, channel, context }), keepalive: true }).catch(() => {});
}

/** SNS共有ボタン（X・LINE・URLコピー・端末の共有メニュー） */
export default function ShareButtons({ eventId, xText, lineText, url, context = 'event', title, compact }: Props) {
  const [copied, setCopied] = useState(false);
  const [canNative, setCanNative] = useState(false);
  useEffect(() => { setCanNative(typeof navigator !== 'undefined' && typeof navigator.share === 'function'); }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // クリップボードが使えない環境では選択用のプロンプトを出す
      window.prompt('このURLをコピーしてください', url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    record(eventId, 'copy', context);
  }

  return (
    <div className={`share ${compact ? 'compact' : ''}`}>
      {title && <div className="share-title">{title}</div>}
      <div className="share-buttons">
        <a className="share-btn x" href={xIntent(xText)} target="_blank" rel="noopener noreferrer" onClick={() => record(eventId, 'x', context)}>
          <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" /></svg>
          Xで共有
        </a>
        <a className="share-btn line" href={lineShare(lineText)} target="_blank" rel="noopener noreferrer" onClick={() => record(eventId, 'line', context)}>
          <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.1.8.2.9.5.1.3.1.7 0 1l-.1.9c0 .3-.2 1 .9.5s5.9-3.5 8-6C21.3 14.3 22 12.7 22 11c0-4.4-4.5-8-10-8z" /></svg>
          LINEで送る
        </a>
        <button type="button" className="share-btn copy" onClick={copy}>{copied ? 'コピーしました' : 'URLをコピー'}</button>
        {canNative && (
          <button type="button" className="share-btn more" aria-label="その他の方法で共有"
            onClick={() => { navigator.share({ text: lineText }).then(() => record(eventId, 'native', context)).catch(() => {}); }}>
            その他
          </button>
        )}
      </div>
    </div>
  );
}
