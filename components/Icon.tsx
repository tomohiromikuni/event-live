import { iconSvg, type IconKind } from '@/lib/icons';

/** ジャンル・施設カテゴリのアイコン。線画が無い種類は登録済みの絵文字で表示する */
export default function KindIcon({ kind, slug, emoji, size = 20, strokeWidth }: {
  kind: IconKind; slug: string; emoji: string; size?: number; strokeWidth?: number;
}) {
  const svg = iconSvg(kind, slug, size, strokeWidth);
  if (!svg) return <span aria-hidden style={{ fontSize: size * 0.9, lineHeight: 1 }}>{emoji}</span>;
  // 中身は lib/icons.ts の固定データのみ（利用者の入力は含まない）
  return <span aria-hidden className="kind-icon" style={{ display: 'inline-flex', flex: 'none' }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
