import { xIntent } from '@/lib/share';

/**
 * イベントの会話は X に任せる（イベナウに掲示板・チャットは作らない：一人での運営で見張りきれないため）。
 * コンパクトな1枠：イベント名のハッシュタグ＋「投稿する」「投稿を見る」。
 */
export default function XTalk({ tag, tags, url }: { tag: string; tags: string[]; url: string }) {
  const text = `\n\n${[tag, ...tags.filter((t) => t !== tag)].slice(0, 3).join(' ')}\n${url}`;
  const search = `https://x.com/search?q=${encodeURIComponent(tag)}&f=live`;
  return (
    <section className="x-talk" aria-label="X でみんなと情報交換">
      <div className="xt-top">
        <span className="x-logo" aria-hidden="true">𝕏</span>
        <span className="xt-title">X で情報交換</span>
        <span className="x-tag one-line">{tag}</span>
      </div>
      <div className="xt-btns">
        <a className="x-btn primary" href={xIntent(text)} target="_blank" rel="noopener noreferrer">このタグで投稿</a>
        <a className="x-btn" href={search} target="_blank" rel="noopener noreferrer">みんなの投稿を見る</a>
      </div>
    </section>
  );
}
