import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

/**
 * AI（Claude API）でページ本文からイベント情報を抜き出す。
 * - 構造化出力（JSON Schema）で決まった形だけを返させる
 * - 書かれていない項目は null（推測で埋めない）。主要項目には根拠となる本文の引用を付けさせる
 * - モデルは環境変数 COLLECT_MODEL で切り替え（既定 claude-haiku-5-5：費用優先。精度が足りなければ claude-opus-5-5）
 * - 共通の指示文はプロンプトキャッシュで再利用し、費用を抑える
 */
export const GENRES = ['fireworks', 'festival', 'music', 'marche', 'food', 'expo', 'anime_game', 'sports', 'local', 'seasonal', 'other'] as const;

export type Extracted = {
  name: string;
  start_date: string | null; end_date: string | null; time_text: string | null;
  prefecture: string | null; city: string | null; venue_name: string | null; address: string | null;
  genre: (typeof GENRES)[number];
  summary: string | null; organizer: string | null; official_url: string | null;
  access: string | null; nearest_station: string | null; parking_info: string | null; traffic_info: string | null; ticket_info: string | null;
  status: 'scheduled' | 'canceled' | 'postponed' | 'unknown';
  evidence: { name: string | null; date: string | null; place: string | null };
};

const str = { anyOf: [{ type: 'string' }, { type: 'null' }] };
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['events'],
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'start_date', 'end_date', 'time_text', 'prefecture', 'city', 'venue_name', 'address', 'genre', 'summary',
          'organizer', 'official_url', 'access', 'nearest_station', 'parking_info', 'traffic_info', 'ticket_info', 'status', 'evidence'],
        properties: {
          name: { type: 'string' },
          start_date: str, end_date: str, time_text: str, prefecture: str, city: str, venue_name: str, address: str,
          genre: { type: 'string', enum: [...GENRES] },
          summary: str, organizer: str, official_url: str, access: str, nearest_station: str,
          parking_info: str, traffic_info: str, ticket_info: str,
          status: { type: 'string', enum: ['scheduled', 'canceled', 'postponed', 'unknown'] },
          evidence: {
            type: 'object', additionalProperties: false, required: ['name', 'date', 'place'],
            properties: { name: str, date: str, place: str },
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `あなたは日本のイベント情報を整理する担当者です。与えられたWebページの本文から、一般の人が参加できるイベントの情報だけを抜き出してJSONで返します。

ルール:
- ページに書かれている事実だけを使う。書かれていない項目は必ず null にする。推測・補完・一般知識での穴埋めはしない。
- 開催日は YYYY-MM-DD。年が書かれていない場合は、ページ内（更新日・「2026年度」など）から年が明確に分かるときだけ補い、分からなければ null。
- 期間の場合は start_date と end_date、1日だけなら end_date は start_date と同じ。
- prefecture は「東京都」「北海道」「京都府」「大阪府」「〇〇県」の正式名。
- genre は次から最も近いもの: fireworks（花火大会）, festival（祭り・地域行事）, music（音楽フェス・ライブ）, marche（マルシェ・フリマ）, food（グルメ・フードフェス）, expo（展示会・見本市）, anime_game（アニメ・ゲーム）, sports（スポーツ）, local（自治体・地域イベント）, seasonal（季節イベント・イルミネーション等）, other。
- summary は本文の丸写しではなく、80字以内の自分の言葉での要約。
- status: 中止なら canceled、延期なら postponed、開催予定と読めるなら scheduled、判断できなければ unknown。
- evidence には、イベント名・日付・場所の根拠となる本文中の文をそのまま短く引用する（無ければ null）。
- 過去の開催報告、ニュース、観光スポットの紹介（日付のない常設の施設）、募集要項だけのページはイベントに含めない。該当がなければ events は空配列。`;

let client: Anthropic | null = null;
/** 使うモデル（運営者の判断で費用優先の Haiku 5.5 を既定にしている） */
export function collectModel() {
  return process.env.COLLECT_MODEL || 'claude-haiku-5-5';
}
export function extractorReady() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function extractEvents(page: { url: string; title: string; text: string }, today: string) {
  client ??= new Anthropic();
  const model = collectModel();
  const isOpus55 = model === 'claude-opus-5-5';
  const res = await client.beta.messages.create({
    model,
    max_tokens: 8000,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `今日の日付: ${today}\nページURL: ${page.url}\nページタイトル: ${page.title}\n\n本文:\n${page.text}` }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA as unknown as Record<string, unknown> } },
    // 安全上の理由で断られた場合に、同じ依頼を別のモデルで続ける（Opus 5.5 のときだけ）
    ...(isOpus55 ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
  } as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming);

  const usage = { input: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0), output: res.usage.output_tokens };
  if (res.stop_reason === 'refusal') throw new Error('AIが処理を断りました（安全上の理由）');
  if (res.stop_reason === 'max_tokens') throw new Error('AIの出力が長すぎて途中で切れました');
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  const parsed = JSON.parse(text) as { events: Extracted[] };
  return { events: Array.isArray(parsed.events) ? parsed.events : [], usage };
}
