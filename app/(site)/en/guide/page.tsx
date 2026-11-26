import type { Metadata } from 'next';
import Link from 'next/link';
import { getLang } from '@/lib/lang';
import { altLanguages, lp, makeTx } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang(), tx = makeTx(lang);
  return {
    title: { absolute: tx('Tips for festivals & events in Japan: toilets, trash, trains | EVENOW') },
    description: tx('Practical tips for visitors from abroad at Japanese festivals, fireworks and events: how toilets work, temporary toilets, trash rules, IC cards and saving a spot.'),
    alternates: { canonical: `${lp(lang)}/guide`, languages: altLanguages('/guide', false) },
  };
}

/** 海外版だけのページ：日本のイベントで知っておくと困らないこと（運営者が書いた一般的な案内。イベントごとの情報ではない） */
const TIPS: { h: string; items: [string, string][] }[] = [
  { h: '🚻 Toilets', items: [
    ['Toilet paper goes in the toilet', 'In Japan you flush the paper. Put other items (sanitary products) in the small bin in the stall.'],
    ['Washlet buttons', '“止” (stop) is usually the red button. “おしり” = rear wash, “ビデ” = front wash. Flushing is a lever, a button marked “流す” or a sensor.'],
    ['Temporary toilets (仮設トイレ)', 'Rows of portable toilets are set up at fireworks and festivals. Lines are longest about an hour before the start and right after the end — go early. Bring tissues and hand sanitizer.'],
    ['Lines', 'People line up in one queue and take the next free stall. Wait your turn quietly; cutting in line is frowned upon.'],
    ['Toilet slippers', 'Some indoor venues have slippers just for the toilet. Take them off when you leave.'],
  ] },
  { h: '🗑️ Trash', items: [
    ['Few public bins', 'Trash cans are rare in Japan. Carry a small bag and take your trash home, or use the event’s trash stations (ゴミステーション).'],
    ['Sorting', 'At trash stations, trash is sorted: burnable (燃えるゴミ), plastic bottles (ペットボトル), cans (缶). Follow the signs or staff.'],
  ] },
  { h: '🚃 Getting there & back', items: [
    ['IC cards', 'Top up your Suica / PASMO / ICOCA (or mobile IC) before the event — ticket machines are crowded afterwards.'],
    ['Leaving after fireworks', 'Stations are extremely crowded right after big events and entry may be controlled. Leaving 15–30 minutes early or waiting an hour helps.'],
    ['Parking', 'Event-day parking fills up early and roads may be closed. Check the parking and traffic info on each event page.'],
  ] },
  { h: '🎆 At fireworks & festivals', items: [
    ['Saving a spot', 'People spread picnic sheets to save viewing spots. Follow the venue rules — some areas ban saving spots or tape.'],
    ['Cash', 'Many food stalls (屋台) accept cash only. Bring small change.'],
    ['Heat & weather', 'Summer events are hot and humid. Bring water; there may be long walks from the station.'],
  ] },
];

export default async function GuideForeign() {
  const lang = await getLang(), tx = makeTx(lang);
  return (
    <div className="container guide-page" style={{ maxWidth: 760 }}>
      <h1 className="page-title">{tx('Tips for events in Japan')}</h1>
      <p className="muted">{tx('Short, practical tips for visitors from abroad. Rules can differ by event — always follow the venue’s signs and staff.')}</p>
      {TIPS.map((sec) => (
        <section className="section" key={sec.h}>
          <h2>{tx(sec.h)}</h2>
          {sec.items.map(([t, d]) => (
            <div className="tip-card" key={t}><h3>{tx(t)}</h3><p>{tx(d)}</p></div>
          ))}
        </section>
      ))}
      <p><Link className="btn" href={lp(lang)}>{tx('Find an event')}</Link></p>
    </div>
  );
}
