import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="container" style={{ padding: '40px 16px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 20 }}>ページが見つかりません</h1>
      <Link className="btn" href="/">トップへ戻る</Link>
    </div>
  );
}
