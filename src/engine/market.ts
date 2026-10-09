import { thaiDateLabel } from './dates';
import { findIssues, type Issue } from './summary';
import { SLOT_LABEL, type AppState, type Slot } from './types';

// ตลาดเวร: ประกาศขาย / หาแลก / รับซื้อ แล้วเจ้าของประกาศกดตกลง ระบบเปลี่ยนตารางให้

export type MarketSlot = Slot | 'SMC';
export type PostKind = 'sell' | 'swap' | 'buy';

export const POST_LABEL: Record<PostKind, string> = { sell: 'ขายเวร', swap: 'หาแลกเวร', buy: 'รับซื้อเวร' };
export const POST_ICON: Record<PostKind, string> = { sell: '🏷️', swap: '🔄', buy: '🛒' };

export interface MarketPost {
  id: string;
  /** เดือนของเวรที่ประกาศ 'YYYY-MM' */
  month: string;
  kind: PostKind;
  /** คนประกาศ */
  by: string;
  /** ขาย/หาแลก = เวรของคนประกาศ, รับซื้อ = วันที่อยากได้ */
  date: string;
  /** รับซื้อ: ไม่ระบุ = เวรไหนก็ได้ในวันนั้น */
  slot?: MarketSlot;
  /** หาแลก: อยากได้วันไหนแทน (ข้อความ) */
  want?: string;
  note?: string;
  /** ขาย/หาแลก: ตกลงแล้วแก้ชื่อในตาราง (ค่าเริ่มต้น) หรือไม่แก้ (เงินเข้าชื่อเดิม แล้วโอนกันเอง) */
  rename?: boolean;
  status: 'open' | 'done' | 'cancelled';
  /** ข้อเสนอที่ตกลง */
  dealId?: string;
  createdAt: string;
  closedAt?: string;
}

export type OfferKind = 'take' | 'swap' | 'give';

export const OFFER_LABEL: Record<OfferKind, string> = {
  take: 'ขอรับเวรนี้',
  swap: 'ขอแลกกับเวรของฉัน',
  give: 'ขายเวรของฉันให้',
};

export interface MarketOffer {
  id: string;
  postId: string;
  month: string;
  by: string;
  kind: OfferKind;
  /** แลก/ขายให้: เวรของคนเสนอ */
  date?: string;
  slot?: MarketSlot;
  /** ขายให้ (ประกาศรับซื้อ): แก้ชื่อในตารางหรือไม่ */
  rename?: boolean;
  note?: string;
  createdAt: string;
}

/** ดีลนี้แก้ชื่อในตารางไหม: คนขายเป็นคนเลือก */
export function dealRenames(post: MarketPost, offer?: MarketOffer): boolean {
  return post.kind === 'buy' ? offer?.rename !== false : post.rename !== false;
}

export const RENAME_LABEL = { true: 'แก้ชื่อในตาราง', false: 'ไม่แก้ชื่อ (เงินเข้าชื่อเดิม โอนกันเอง)' } as const;

export interface CellMark {
  icon: string;
  title: string;
}

/**
 * สัญลักษณ์ในช่องตาราง: 🏷️/🔄 = มีประกาศขาย/หาแลกอยู่, 🤝 = ขาย/แลกแบบไม่แก้ชื่อแล้ว (คนอยู่จริงเป็นอีกคน)
 * key = วันที่|ช่อง
 */
export function cellMarks(posts: MarketPost[], offers: MarketOffer[], name: (id: string) => string): Map<string, CellMark> {
  const out = new Map<string, CellMark>();
  for (const p of posts) {
    if (p.status === 'open' && p.kind !== 'buy' && p.slot) {
      out.set(`${p.date}|${p.slot}`, { icon: POST_ICON[p.kind], title: `${name(p.by)} ${POST_LABEL[p.kind]}` });
    }
    if (p.status !== 'done') continue;
    const o = offers.find((x) => x.id === p.dealId);
    if (!o || dealRenames(p, o)) continue;
    if (p.kind === 'buy') {
      if (o.date && o.slot) out.set(`${o.date}|${o.slot}`, { icon: '🤝', title: `${name(o.by)} ขายให้ ${name(p.by)} แล้ว (ไม่แก้ชื่อ) — อยู่จริง: ${name(p.by)}` });
    } else if (p.slot) {
      out.set(`${p.date}|${p.slot}`, { icon: '🤝', title: `${name(p.by)} ${o.kind === 'swap' ? 'แลก' : 'ขาย'}ให้ ${name(o.by)} แล้ว (ไม่แก้ชื่อ) — อยู่จริง: ${name(o.by)}` });
      if (o.kind === 'swap' && o.date && o.slot) {
        out.set(`${o.date}|${o.slot}`, { icon: '🤝', title: `${name(o.by)} แลกให้ ${name(p.by)} แล้ว (ไม่แก้ชื่อ) — อยู่จริง: ${name(p.by)}` });
      }
    }
  }
  return out;
}

export const shiftText = (date: string, slot?: MarketSlot) =>
  `${slot ? SLOT_LABEL[slot] : 'เวรใดก็ได้'} ${thaiDateLabel(date)}`;

/** เวรทั้งหมดของคนนี้ในเดือนนั้น (ไว้เลือกขาย/แลก) */
export function shiftsOf(state: AppState, id: string, month: string): { date: string; slot: MarketSlot }[] {
  const out: { date: string; slot: MarketSlot }[] = [];
  for (const [date, a] of Object.entries(state.days)) {
    if (!date.startsWith(month)) continue;
    for (const s of ['O', 'I', 'S', 'PM', 'N', 'SMC'] as const) if (a[s] === id) out.push({ date, slot: s });
  }
  return out.sort((x, y) => x.date.localeCompare(y.date));
}

/** ข้อเสนอแบบไหนใช้กับประกาศแบบไหนได้ */
export function offerKindsFor(kind: PostKind): OfferKind[] {
  return kind === 'buy' ? ['give'] : kind === 'swap' ? ['swap', 'take'] : ['take', 'swap'];
}

export interface DealResult {
  state?: AppState;
  error?: string;
  /** ข้อผิดพลาดใหม่ที่เกิดจากดีลนี้ (ให้คนกดตกลงยืนยันก่อน) */
  issues: Issue[];
  summary: string;
}

/**
 * ทำดีล: ย้ายชื่อในตาราง
 * ขาย/หาแลก + รับ  → เวรของคนประกาศเป็นของคนเสนอ
 * ขาย/หาแลก + แลก → สลับเวรสองช่อง
 * รับซื้อ + ขายให้ → เวรของคนเสนอเป็นของคนประกาศ
 */
export function applyDeal(state: AppState, post: MarketPost, offer: MarketOffer, requests: Parameters<typeof findIssues>[2] = []): DealResult {
  const name = (id: string) => state.people.find((p) => p.id === id)?.name ?? id;
  const days = { ...state.days };
  const move = (date: string, slot: MarketSlot, from: string, to: string): string | undefined => {
    if (days[date]?.[slot] !== from) return `${shiftText(date, slot)} ไม่ใช่ของ ${name(from)} แล้ว (ตารางเปลี่ยนไป)`;
    days[date] = { ...days[date], [slot]: to };
    return undefined;
  };
  let err: string | undefined;
  let summary = '';
  if (post.kind === 'buy') {
    if (!offer.date || !offer.slot) return { error: 'ข้อเสนอไม่มีเวร', issues: [], summary };
    err = move(offer.date, offer.slot, offer.by, post.by);
    summary = `${name(offer.by)} ขาย${shiftText(offer.date, offer.slot)} ให้ ${name(post.by)}`;
  } else {
    if (!post.slot) return { error: 'ประกาศไม่มีเวร', issues: [], summary };
    err = move(post.date, post.slot, post.by, offer.by);
    if (!err && offer.kind === 'swap') {
      if (!offer.date || !offer.slot) return { error: 'ข้อเสนอไม่มีเวรที่จะแลก', issues: [], summary };
      err = move(offer.date, offer.slot, offer.by, post.by);
      summary = `${name(post.by)} แลก${shiftText(post.date, post.slot)} กับ ${name(offer.by)} (${shiftText(offer.date, offer.slot)})`;
    } else {
      summary = `${name(post.by)} ${post.kind === 'sell' ? 'ขาย' : 'ให้'}${shiftText(post.date, post.slot)} ให้ ${name(offer.by)}`;
    }
  }
  if (err) return { error: err, issues: [], summary };
  const next = { ...state, days };
  // เทียบข้อผิดพลาดก่อน/หลัง เฉพาะสองคนในดีล
  const who = new Set([post.by, offer.by]);
  const months = [...new Set([post.date, offer.date].filter((d): d is string => !!d).map((d) => d.slice(0, 7)))];
  const key = (i: Issue) => `${i.date}|${i.personId}|${i.message}`;
  const issues: Issue[] = [];
  for (const m of months) {
    const before = new Set(findIssues(state.days, state.people, requests, m, state.holidays).map(key));
    for (const i of findIssues(days, state.people, requests, m, state.holidays)) {
      if (who.has(i.personId) && !before.has(key(i))) issues.push(i);
    }
  }
  return { state: next, issues, summary };
}
