/** 掲載停止の申請・問い合わせの選択肢（フォームと管理画面で共通） */
export const REMOVAL_REASONS = [
  '主催者・関係者として掲載を希望しない',
  '掲載内容に誤りがある',
  'イベントが中止・終了した',
  '会場マップや情報の権利に関する問題',
  'その他',
] as const;

export const RELATIONS = ['主催者・運営団体', '会場・施設の関係者', '出演者・出店者', '一般の方', 'その他'] as const;

export const CONTACT_TOPICS = ['掲載内容の訂正', '掲載してほしいイベント', 'ガイドマップ（会場図）の場所を知らせる', 'スポンサー・協賛のご相談', 'サイトの不具合', 'その他'] as const;

export const KIND_LABEL: Record<string, string> = { removal: '掲載停止の申請', contact: '運営への問い合わせ' };
