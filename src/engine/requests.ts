import { BIT } from './cost';
import type { RequestSlot, ShiftRequest, Slot } from './types';

// คำขอแยกตามเวร: ทั้งวัน / เช้า (OPD, IPD, เสริม) / บ่าย / ดึก

export const REQUEST_SLOT_LABEL: Record<RequestSlot, string> = { day: 'ทั้งวัน', M: 'เช้า', PM: 'บ่าย', N: 'ดึก' };

const MORNING = BIT.O | BIT.I | BIT.S;
const ALL = MORNING | BIT.PM | BIT.N | BIT.SMC;

/** เวรที่ห้ามลง ("ไม่ว่างบ่าย" ห้าม SMC ด้วย เพราะเวลาทับกัน) */
export function offBits(slot: RequestSlot = 'day'): number {
  return { day: ALL, M: MORNING, PM: BIT.PM | BIT.SMC, N: BIT.N }[slot];
}

/** เวรที่ขออยู่ (ได้อย่างใดอย่างหนึ่งก็ถือว่าได้ตามขอ) */
export function wantBits(slot: RequestSlot = 'day'): number {
  return { day: MORNING | BIT.PM | BIT.N, M: MORNING, PM: BIT.PM, N: BIT.N }[slot];
}

export function slotBit(s: Slot | 'SMC'): number {
  return BIT[s];
}

export function requestLabel(r: Pick<ShiftRequest, 'type' | 'slot'>): string {
  const base = r.type === 'off' ? 'ไม่ว่าง' : 'ขออยู่';
  return !r.slot || r.slot === 'day' ? base : `${base}${REQUEST_SLOT_LABEL[r.slot]}`;
}

export interface RequestIndex {
  /** เวรที่ห้ามลงในวันนั้น (bitmask) */
  off: (id: string, date: string) => number;
  /** เวรที่ขออยู่ในวันนั้น (bitmask, 0 = ไม่ได้ขอ) */
  want: (id: string, date: string) => number;
  /** แจ้งไม่ว่างทั้งวัน */
  fullDay: (id: string, date: string) => boolean;
  /** แจ้งไม่ว่างแบบใดก็ได้ */
  anyOff: (id: string, date: string) => boolean;
}

export function indexRequests(requests: ShiftRequest[]): RequestIndex {
  const off = new Map<string, number>();
  const want = new Map<string, number>();
  for (const r of requests) {
    const k = `${r.personId}|${r.date}`;
    if (r.type === 'off') off.set(k, (off.get(k) ?? 0) | offBits(r.slot));
    else want.set(k, (want.get(k) ?? 0) | wantBits(r.slot));
  }
  return {
    off: (id, d) => off.get(`${id}|${d}`) ?? 0,
    want: (id, d) => want.get(`${id}|${d}`) ?? 0,
    fullDay: (id, d) => (off.get(`${id}|${d}`) ?? 0) === ALL,
    anyOff: (id, d) => off.has(`${id}|${d}`),
  };
}
