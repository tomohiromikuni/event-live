/**
 * 公式情報の文から「記載はありません」「情報なし」のような“無い”ことを書いた文を取り除く。
 * 情報が無い項目は空にして、画面では「未確認」と出す（無いことを公式情報のように見せない）。
 */
const NEGATIVE = /(記載|案内|情報|掲載|言及)[^。]{0,8}(ありません|ない|無い|なし|無し|見当たりません|見つかりません|見当たらない)|不明です|確認できません/;

export function cleanInfoText(v: string): string {
  if (!v) return '';
  return v.split(/(?<=[。．])/).map((s) => s.trim()).filter((s) => s && !NEGATIVE.test(s)).join('').trim();
}

/** 住所から市区町村を取り出す（「北海道虻田郡洞爺湖町洞爺湖温泉」→「洞爺湖町」）。分からなければ空 */
export function cityFromAddress(address: string): string {
  const a = address.replace(/^(北海道|東京都|京都府|大阪府|.{2,3}県)/, '').replace(/^.{1,4}郡/, '');
  return a.match(/^(.{1,6}?[市区町村])/)?.[1] ?? '';
}
