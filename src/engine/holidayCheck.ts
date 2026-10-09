import { addDays, daysInMonth, thaiDateLabel } from './dates';
import type { AppState, Holiday } from './types';

// ตรวจว่าวันหยุดที่เกี่ยวกับเดือนนี้เปลี่ยนไปหลังจากจัดเวรแล้วหรือไม่

/** ช่วงวันที่ที่วันหยุดมีผลต่อการจัดเดือนนี้ (รวมช่วงหยุดที่คร่อมเดือน) */
function window(month: string): [string, string] {
  const d = daysInMonth(month);
  return [addDays(d[0], -1), addDays(d[d.length - 1], 14)];
}

const key = (h: Holiday) => (h.festival ? `${h.date}:${h.festival}` : h.date);

export function holidaySignature(holidays: Holiday[], month: string): string[] {
  const [from, to] = window(month);
  return holidays
    .filter((h) => h.date >= from && h.date <= to)
    .map(key)
    .sort();
}

export interface HolidayChange {
  month: string;
  added: string[];
  removed: string[];
}

/** null = ไม่เปลี่ยน หรือเดือนนี้ยังไม่ได้จัด/เป็นข้อมูลเก่าที่ไม่ได้บันทึกไว้ */
export function holidayChange(state: AppState, month: string): HolidayChange | null {
  const used = state.months[month]?.holidaysUsed;
  if (!used) return null;
  const now = holidaySignature(state.holidays, month);
  const added = now.filter((k) => !used.includes(k));
  const removed = used.filter((k) => !now.includes(k));
  return added.length || removed.length ? { month, added, removed } : null;
}

export function changedMonths(state: AppState): HolidayChange[] {
  return Object.keys(state.months)
    .sort()
    .map((m) => holidayChange(state, m))
    .filter((c): c is HolidayChange => c !== null);
}

const FEST = { newyear: 'ปีใหม่', songkran: 'สงกรานต์' } as const;

export function describeChange(state: AppState, c: HolidayChange): string {
  const label = (k: string) => {
    const [date, fest] = k.split(':') as [string, keyof typeof FEST | undefined];
    const name = state.holidays.find((h) => h.date === date)?.name;
    return `${thaiDateLabel(date)}${name ? ` ${name}` : ''}${fest ? ` (${FEST[fest]})` : ''}`;
  };
  return [
    c.added.length ? `เพิ่ม ${c.added.map(label).join(', ')}` : '',
    c.removed.length ? `ลบ/เปลี่ยน ${c.removed.map(label).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
