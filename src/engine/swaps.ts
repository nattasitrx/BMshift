import { daysInMonth } from './dates';
import type { AppState, DayAssign, MonthRecord, Slot } from './types';

// ฝาก/ยืมเวร: เทียบตารางปัจจุบันกับเวรตามที่ระบบจัด (baseline)
// ช่องที่เปลี่ยนคน = เจ้าของเดิม "ฝาก" ให้คนที่อยู่จริง (คนที่อยู่จริง "อยู่แทน")

const SWAP_SLOTS = ['O', 'I', 'S', 'PM', 'N', 'SMC'] as const;
type SwapSlot = Slot | 'SMC';

/**
 * อัปเดตเวรตั้งต้นหลังระบบจัด: ช่องที่ระบบเพิ่งจัด/เปลี่ยน ใช้ผลใหม่
 * ช่องที่ระบบไม่ได้แตะ คงเจ้าของเดิมไว้ (จะได้ไม่ลบประวัติการแลกที่ทำไว้แล้ว)
 */
export function nextBaseline(
  month: string,
  before: Record<string, DayAssign>,
  after: Record<string, DayAssign>,
  old: MonthRecord | undefined,
  full: boolean,
): Record<string, DayAssign> {
  const out: Record<string, DayAssign> = {};
  for (const d of daysInMonth(month)) {
    const row: DayAssign = {};
    for (const s of SWAP_SLOTS) {
      const now = after[d]?.[s];
      const prevBase = old?.baseline?.[d]?.[s];
      const value = full || now !== before[d]?.[s] || prevBase === undefined ? now : prevBase;
      if (value) row[s] = value;
    }
    if (Object.keys(row).length) out[d] = row;
  }
  return out;
}

/** ตั้งเวรตั้งต้นให้เดือนที่ยังไม่มี (เช่น ข้อมูลเก่า) = ตารางตอนนี้ */
export function withBaselines(state: AppState): AppState {
  let changed = false;
  const months = { ...state.months };
  for (const [m, rec] of Object.entries(state.months)) {
    if (rec.baseline) continue;
    const baseline: Record<string, DayAssign> = {};
    for (const d of daysInMonth(m)) if (state.days[d]) baseline[d] = { ...state.days[d] };
    months[m] = { ...rec, baseline };
    changed = true;
  }
  return changed ? { ...state, months } : state;
}

export interface SwapItem {
  date: string;
  slot: SwapSlot;
  /** เจ้าของเวรเดิม (คนฝาก) */
  from: string;
  /** คนที่อยู่จริง (คนอยู่แทน) */
  to: string;
}

export function swapsOf(state: AppState, months: string[]): SwapItem[] {
  const out: SwapItem[] = [];
  for (const m of [...months].sort()) {
    const base = state.months[m]?.baseline;
    if (!base) continue;
    for (const d of daysInMonth(m)) {
      for (const s of SWAP_SLOTS) {
        const from = base[d]?.[s];
        const to = state.days[d]?.[s];
        if (from && to && from !== to) out.push({ date: d, slot: s, from, to });
      }
    }
  }
  return out;
}

export interface SwapBalance {
  id: string;
  /** ฝากให้คนอื่นอยู่แทน */
  gave: number;
  /** อยู่แทนคนอื่น */
  took: number;
}

export function swapBalances(items: SwapItem[]): SwapBalance[] {
  const m = new Map<string, SwapBalance>();
  const get = (id: string) => m.get(id) ?? (m.set(id, { id, gave: 0, took: 0 }), m.get(id)!);
  for (const it of items) {
    get(it.from).gave++;
    get(it.to).took++;
  }
  return [...m.values()];
}

export interface SwapPair {
  a: string;
  b: string;
  /** a ฝากให้ b อยู่แทน */
  aToB: SwapItem[];
  /** b ฝากให้ a อยู่แทน */
  bToA: SwapItem[];
}

/** รวมเป็นคู่ เพื่อดูว่าใครยังติดเวรใครอยู่ */
export function swapPairs(items: SwapItem[]): SwapPair[] {
  const pairs = new Map<string, SwapPair>();
  for (const it of items) {
    const [a, b] = [it.from, it.to].sort();
    const k = `${a}|${b}`;
    const p = pairs.get(k) ?? { a, b, aToB: [], bToA: [] };
    (it.from === a ? p.aToB : p.bToA).push(it);
    pairs.set(k, p);
  }
  return [...pairs.values()];
}

/** การเปลี่ยนที่ระบบทำเอง (เช่น จัดเทศกาลใหม่) ไม่นับเป็นการฝากเวร: ปรับเวรตั้งต้นของเดือนที่จัดแล้วตาม */
export function syncBaselines(prev: AppState, next: AppState): AppState {
  const months = { ...next.months };
  let changed = false;
  for (const [m, rec] of Object.entries(next.months)) {
    if (!rec.baseline) continue;
    const baseline = { ...rec.baseline };
    let touched = false;
    for (const d of daysInMonth(m)) {
      for (const s of SWAP_SLOTS) {
        const a = prev.days[d]?.[s];
        const b = next.days[d]?.[s];
        if (a === b) continue;
        const row = { ...(baseline[d] ?? {}) };
        if (b) row[s] = b;
        else delete row[s];
        baseline[d] = row;
        touched = true;
      }
    }
    if (touched) {
      months[m] = { ...rec, baseline };
      changed = true;
    }
  }
  return changed ? { ...next, months } : next;
}
