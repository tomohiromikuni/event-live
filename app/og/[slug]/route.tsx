import { ImageResponse } from 'next/og';
import { getEventBySlug, redirectedSlug } from '@/lib/queries';
import { fmtRange } from '@/lib/dates';
import { iconSvg } from '@/lib/icons';
import { UNOFFICIAL } from '@/lib/site';

/**
 * イベントごとの SNS 共有画像（1200×630）。
 * イベント名・日付・会場を、トップの OGP 画像と同じテーマAのデザインで描く。
 * 日本語フォントは Google Fonts から必要な文字だけ取得する。取得できない場合は共通画像に切り替える。
 */
export const dynamic = 'force-dynamic';

const INK = '#1b1530';
const PINK = '#e0245e';
const YELLOW = '#ffd23f';
const CREAM = '#fff6e6';
const MUTED = '#4a4560';
const BUBBLE = 'M22 8h66a16 16 0 0 1 16 16v38a16 16 0 0 1-16 16H48L26 96V78h-4A16 16 0 0 1 6 62V24A16 16 0 0 1 22 8z';

async function loadFont(text: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(
      `https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@${weight}&text=${encodeURIComponent(text)}`,
    )).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return null;
    const res = await fetch(url);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

function svgData(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const fallback = new URL('/og.png', req.url);
  const slug = (await params).slug;
  const e = await getEventBySlug(slug) ?? await redirectedSlug(slug).then((s) => (s ? getEventBySlug(s) : undefined));
  if (!e || !e.published) return Response.redirect(fallback, 302);

  const name = e.name;
  const date = `${fmtRange(e.start_date, e.end_date)}${e.time_text ? `　${e.time_text}` : ''}`;
  const place = `${e.prefecture}${e.city}${e.venue_name ? `・${e.venue_name}` : ''}`;
  const status = e.status === 'canceled' ? '中止' : e.status === 'postponed' ? '延期' : '';
  const cta = '会場の混雑・待ち時間を、来場者がリアルタイムで共有';
  const note = UNOFFICIAL ? '非公式・主催者とは無関係の情報共有サービス' : '';
  const brand = 'EVENOW イベナウ サンプル';

  const [bold, regular] = await Promise.all([
    loadFont(name + status + e.genre_name + brand + cta, 900),
    loadFont(date + place + note + '日時場所', 700),
  ]);
  if (!bold || !regular) return Response.redirect(fallback, 302);

  // 1行あたり約 990px。名前の長さで文字サイズを決め、最大2行に収める
  const nameSize = name.length <= 14 ? 70 : name.length <= 17 ? 58 : name.length <= 34 ? 50 : 42;
  const genreIcon = iconSvg('genre', e.genre_slug, 30, 2.4)?.replace('currentColor', '#ffffff');
  const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 104"><path d="${BUBBLE}" fill="${INK}" transform="translate(5 5)"/><path d="${BUBBLE}" fill="${YELLOW}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/><circle cx="40" cy="43" r="11" fill="${PINK}" stroke="${INK}" stroke-width="5"/><path d="M62 30a18 18 0 0 1 0 26M76 22a30 30 0 0 1 0 42" fill="none" stroke="${INK}" stroke-width="6" stroke-linecap="round"/></svg>`;
  const pin = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>`;
  const cal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>`;

  const badge = (text: string, bg: string, color = '#fff') => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 26, fontWeight: 900, color, background: bg, padding: '6px 18px', borderRadius: 14, border: `4px solid ${INK}` }}>{text}</div>
  );

  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: 'flex', flexDirection: 'column', background: CREAM, padding: '40px 56px', fontFamily: 'Rounded', color: INK, position: 'relative' }}>
        {/* 飾り */}
        <div style={{ position: 'absolute', right: -90, top: -110, width: 300, height: 300, borderRadius: 300, background: YELLOW, border: `5px solid ${INK}` }} />
        <div style={{ position: 'absolute', right: 170, top: 36, width: 44, height: 44, borderRadius: 44, background: '#3dd6c4', border: `5px solid ${INK}` }} />

        {/* ロゴ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={svgData(mark)} width={70} height={66} alt="" />
          <div style={{ fontSize: 44, fontWeight: 900 }}>EVENOW</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: MUTED, marginLeft: 6 }}>イベナウ</div>
        </div>

        {/* イベント */}
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 34, background: '#fff', border: `5px solid ${INK}`, borderRadius: 36, boxShadow: `10px 10px 0 ${INK}`, padding: '34px 44px', width: 1080, height: 380 }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 26, fontWeight: 900, color: '#fff', background: e.genre_color, padding: '6px 18px', borderRadius: 14, border: `4px solid ${INK}` }}>
              {genreIcon ? <img src={svgData(genreIcon)} width={30} height={30} alt="" /> : null}
              {e.genre_name}
            </div>
            {e.is_sample ? badge('サンプル', YELLOW, INK) : null}
            {status ? badge(status, INK) : null}
          </div>
          <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center', fontSize: nameSize, fontWeight: 900, lineHeight: 1.25, margin: '10px 0', overflow: 'hidden' }}>{name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 28, fontWeight: 700, color: MUTED }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><img src={svgData(cal)} width={30} height={30} alt="" />{date}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><img src={svgData(pin)} width={30} height={30} alt="" />{place}</div>
          </div>
        </div>

        {/* 下部 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
          <div style={{ display: 'flex', fontSize: 24, fontWeight: 900, color: '#fff', background: PINK, padding: '8px 20px', borderRadius: 14, border: `4px solid ${INK}` }}>{cta}</div>
          <div style={{ display: 'flex', fontSize: 18, fontWeight: 700, color: MUTED }}>{note}</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: 'Rounded', data: bold, weight: 900, style: 'normal' },
        { name: 'Rounded', data: regular, weight: 700, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400' },
    },
  );
}
