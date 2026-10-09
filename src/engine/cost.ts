import type { Slot } from './types';

export const BIT: Record<Slot | 'SMC', number> = { O: 1, I: 2, S: 4, PM: 8, N: 16, SMC: 32 };
const MORNING = BIT.O | BIT.I | BIT.S;
/** เวรที่นับเข้ายอด "เวรรวม" (ไม่นับเสริมและ SMC) */
export const COUNTED = BIT.O | BIT.I | BIT.PM | BIT.N;

export const HARD = 100_000;
export const W = {
  nightThenAfternoon: 300,
  afternoonThenNight: 300,
  // คำขอ "ขออยู่" สำคัญกว่าการเฉลี่ยยอดต่างกัน 1 เวร
  wantMissed: 3000,
  doubleSplit: 40,
  consecutiveDays: 15,
  twoDaysApart: 4,
};

export interface CostCtx {
  /** index ของวันที่ขอไม่ว่าง */
  off: Set<number>;
  /** index ของวันที่ขออยู่ */
  want: Set<number>;
  canDouble: boolean;
  /** index ของวันธรรมดาที่ไม่ใช่ช่วงหยุด/คืนก่อนหยุด */
  plainDay: Set<number>;
  /** index ของวันหยุด (เสาร์–อาทิตย์/นักขัตฤกษ์) */
  offDay: Set<number>;
}

/**
 * ค่าความไม่เหมาะสมของตารางคนหนึ่งคน (masks[i] = bitmask เวรของวันที่ i)
 * HARD = ผิดกฎห้าม, ค่าอื่น = ไม่ควร
 */
export function maskCost(m: number[], c: CostCtx): number {
  let cost = 0;
  const n = m.length;
  for (let i = 0; i < n; i++) {
    const x = m[i];
    if (!x) {
      if (c.want.has(i)) cost += W.wantMissed;
      continue;
    }
    if (c.off.has(i)) cost += HARD;
    if (popcount(x & MORNING) > 1) cost += HARD;
    const pm = (x & BIT.PM) !== 0;
    const nt = (x & BIT.N) !== 0;
    if (pm && nt && !c.canDouble) cost += HARD;
    if (c.plainDay.has(i) && c.canDouble && pm !== nt) cost += W.doubleSplit;
    if (x & BIT.SMC && x & (BIT.PM | BIT.N)) cost += HARD;
    const y = i + 1 < n ? m[i + 1] : 0;
    if (nt) {
      // ห้ามดึกต่อเช้า และห้ามดึกติดกัน
      if (y & (MORNING | BIT.N)) cost += HARD;
      else if (y & (BIT.PM | BIT.SMC)) cost += W.nightThenAfternoon;
    } else if (pm && y & BIT.N && !c.offDay.has(i + 1)) {
      // แพทเทิร์นวันหยุดมีบ่ายแล้วต่อดึกวันถัดไปอยู่แล้ว จึงเลี่ยงเฉพาะวันธรรมดา
      cost += W.afternoonThenNight;
    }
    if (y) cost += W.consecutiveDays;
    if (i + 2 < n && m[i + 2]) cost += W.twoDaysApart;
  }
  return cost;
}

export function popcount(x: number): number {
  let c = 0;
  while (x) {
    c += x & 1;
    x >>= 1;
  }
  return c;
}
