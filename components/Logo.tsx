/**
 * EVENOW ロゴ（MIX-A）
 * - BubbleMark: 吹き出しマーク。ヘッダーなど小さいサイズ用（中は点のみ）
 * - LogoLockup: 吹き出し（点＋電波）＋「EVEN✺W」（O が花火：光の筋と火の粉）のフルロゴ
 */
const BUBBLE = 'M22 8h66a16 16 0 0 1 16 16v38a16 16 0 0 1-16 16H48L26 96V78h-4A16 16 0 0 1 6 62V24A16 16 0 0 1 22 8z';
const INK = '#1b1530';
const PINK = '#e0245e';
const YELLOW = '#ffd23f';

export function BubbleMark({ size = 32 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size * 104 / 110} viewBox="0 0 110 104">
      <path d={BUBBLE} fill={YELLOW} stroke={INK} strokeWidth="9" strokeLinejoin="round" />
      <circle cx="44" cy="43" r="13" fill={PINK} stroke={INK} strokeWidth="7" />
    </svg>
  );
}

/**
 * 「NOW」の O（花火）。中心から光の筋が伸び、先に火の粉が付く。ピンクと黄色が交互。
 * 小さいサイズ（40px未満）では筋を減らして潰れないようにする。
 */
function SparkO({ size }: { size: number }) {
  const n = size < 40 ? 8 : 12;
  const rays = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const at = (r: number) => [42 + r * Math.cos(a), 42 + r * Math.sin(a)].map((v) => Math.round(v * 10) / 10);
    return { from: at(9), to: at(25), dot: at(32), color: i % 2 ? YELLOW : PINK };
  });
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 84 84" style={{ margin: `0 ${-size * 0.045}px`, flex: 'none' }}>
      {rays.map((r, i) => (
        <g key={i}>
          <line x1={r.from[0]} y1={r.from[1]} x2={r.to[0]} y2={r.to[1]} stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <line x1={r.from[0]} y1={r.from[1]} x2={r.to[0]} y2={r.to[1]} stroke={r.color} strokeWidth="2.8" strokeLinecap="round" />
          <circle cx={r.dot[0]} cy={r.dot[1]} r="4.2" fill={r.color} stroke={INK} strokeWidth="2.2" />
        </g>
      ))}
      <circle cx="42" cy="42" r="3.5" fill={INK} />
    </svg>
  );
}

/** フルロゴ。fontSize は文字の大きさ（px） */
export function LogoLockup({ fontSize = 40, kana = true }: { fontSize?: number; kana?: boolean }) {
  const mark = fontSize * 1.5;
  return (
    <span className="logo-lockup" role="img" aria-label="EVENOW（イベナウ）" style={{ display: 'inline-flex', alignItems: 'center', gap: fontSize * 0.26 }}>
      <svg aria-hidden width={mark} height={mark * 104 / 110} viewBox="0 0 110 104" style={{ flex: 'none' }}>
        <path d={BUBBLE} fill={INK} transform="translate(5 5)" />
        <path d={BUBBLE} fill={YELLOW} stroke={INK} strokeWidth="6" strokeLinejoin="round" />
        <circle cx="40" cy="43" r="11" fill={PINK} stroke={INK} strokeWidth="5" />
        <path d="M62 30a18 18 0 0 1 0 26M76 22a30 30 0 0 1 0 42" fill="none" stroke={INK} strokeWidth="6" strokeLinecap="round" />
      </svg>
      <span style={{ display: 'inline-flex', flexDirection: 'column' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', fontWeight: 900, fontSize, lineHeight: 1, color: INK }}>
          EVEN<SparkO size={fontSize * 1.06} />W
        </span>
        {kana && <span style={{ fontWeight: 800, fontSize: Math.max(11, fontSize * 0.27), letterSpacing: '.3em', color: 'var(--muted)', marginTop: fontSize * 0.1, paddingLeft: 2 }}>イベナウ</span>}
      </span>
    </span>
  );
}
