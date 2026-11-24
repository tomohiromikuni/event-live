/**
 * EVENOW ロゴ（MIX-A）
 * - BubbleMark: 吹き出しマーク。ヘッダーなど小さいサイズ用（中は点のみ）
 * - LogoLockup: 吹き出し（点＋電波）＋「EVEN✺W」（O が花火）のフルロゴ
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

function SparkO({ size }: { size: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 84 84" style={{ margin: `0 ${-size * 0.045}px`, flex: 'none' }}>
      <g stroke={INK} strokeWidth="5" strokeLinecap="round">
        <path d="M42 4v10M42 70v10M4 42h10M70 42h10M15 15l7 7M62 62l7 7M69 15l-7 7M22 62l-7 7" />
      </g>
      <g stroke={YELLOW} strokeWidth="2.4" strokeLinecap="round">
        <path d="M42 5v8M42 71v8M5 42h8M71 42h8M16 16l5 5M63 63l5 5M68 16l-5 5M21 63l-5 5" />
      </g>
      <circle cx="42" cy="42" r="20" fill={PINK} stroke={INK} strokeWidth="6" />
      <circle cx="42" cy="42" r="7" fill="#fff" stroke={INK} strokeWidth="4" />
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
