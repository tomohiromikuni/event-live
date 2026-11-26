import { xIntent } from '@/lib/share';

/**
 * イベントの会話は X に任せる（イベナウに掲示板・チャットは作らない：一人での運営で見張りきれないため）。
 * イベント名のハッシュタグで X に投稿する／X で同じタグの投稿を見る、の2つのボタンを目立たせる。
 */
export default function XTalk({ tag, tags, url }: { tag: string; tags: string[]; url: string }) {
  const text = `\n\n${[tag, ...tags.filter((t) => t !== tag)].slice(0, 3).join(' ')}\n${url}`;
  const search = `https://x.com/search?q=${encodeURIComponent(tag)}&f=live`;
  return (
    <section className="x-talk" aria-labelledby="x-talk-h">
      <h2 id="x-talk-h">X でみんなと情報交換</h2>
      <p className="one-line">来場者どうしの会話は X で</p>
      <div className="x-tag">{tag}</div>
      <a className="x-btn primary" href={xIntent(text)} target="_blank" rel="noopener noreferrer">
        <span aria-hidden="true" className="x-logo">𝕏</span>このタグで投稿する
      </a>
      <a className="x-btn" href={search} target="_blank" rel="noopener noreferrer">X でみんなの投稿を見る</a>
      <p className="muted small one-line" style={{ margin: '8px 0 0' }}>X の投稿はイベナウでは確認していません</p>
    </section>
  );
}
