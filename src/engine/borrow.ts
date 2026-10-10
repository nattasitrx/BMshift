import { daysInMonth, shiftMonth } from './dates';
import type { AppState } from './types';

// ยืมเวร: ใครอยู่เกินเป้าเพราะแพทเทิร์น (เช่น ส-อา, วันหยุด) ถือว่า "ยืม" เวรคนอื่นมา
// เดือนถัดไปคนที่ยืมจะได้เป้าน้อยลง คนที่ให้ยืมได้เป้าเพิ่ม จนกว่าจะหักคืนกันหมด
// ค่า + = ยืมมา (เดือนหน้าอยู่น้อยลง), − = ให้ยืม (เดือนหน้าอยู่เพิ่ม)
export type Balance = Record<string, number>;

const MAX_DEPTH = 36;

/** เวรรวม (OPD+IPD+บ่าย+ดึก) ที่อยู่จริงในเดือนนั้น */
export function monthTotals(state: AppState, month: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of daysInMonth(month)) {
    const a = state.days[d];
    if (!a) continue;
    for (const s of ['O', 'I', 'PM', 'N'] as const) {
      const id = a[s];
      if (id) out.set(id, (out.get(id) ?? 0) + 1);
    }
  }
  return out;
}

/** ยอดยืมยกมาต้นเดือน: ใช้ค่าที่กรอกเอง ถ้าไม่มีใช้ยอดสิ้นเดือนก่อน */
export function borrowIn(state: AppState, month: string, depth = 0): Balance {
  const manual = state.borrowStart?.[month];
  if (manual) return { ...manual };
  if (depth >= MAX_DEPTH) return {};
  return borrowOut(state, shiftMonth(month, -1), depth + 1);
}

/** ยอดยืมสิ้นเดือน = ยกมา + อยู่จริง − เป้าปกติ (คำนวณจากตารางจริง แก้มือแล้วก็ตามทัน) */
export function borrowOut(state: AppState, month: string, depth = 0): Balance {
  const rec = state.months[month];
  if (!rec) return state.borrowStart?.[month] ? { ...state.borrowStart[month] } : {};
  const inn = borrowIn(state, month, depth);
  const base = rec.baseTargets;
  // เดือนที่ไม่ได้จัดด้วยระบบ (เช่นนำเข้าจากรูป) ยกยอดผ่านไปเฉยๆ
  if (!base) return inn;
  const actual = monthTotals(state, month);
  const out: Balance = { ...inn };
  for (const [id, t] of Object.entries(base)) out[id] = (inn[id] ?? 0) + (actual.get(id) ?? 0) - t;
  return clean(out);
}

/** เป้าเดือนนี้หลังหักยอดยืม */
export function adjustedTarget(base: number, carry: number): number {
  return Math.max(0, base - carry);
}

export function clean(b: Balance): Balance {
  const out: Balance = {};
  for (const [id, v] of Object.entries(b)) if (v) out[id] = v;
  return out;
}

export function describeBalance(b: Balance, nameOf: (id: string) => string): string {
  const parts = Object.entries(b)
    .filter(([, v]) => v)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => `${nameOf(id)} ${v > 0 ? `ยืม ${v}` : `ให้ยืม ${-v}`}`);
  return parts.join(', ');
}

export function signed(v: number): string {
  return v > 0 ? `+${v}` : `−${-v}`;
}
