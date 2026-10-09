// วันที่ทั้งหมดเก็บเป็น 'YYYY-MM-DD' และคำนวณแบบ UTC เพื่อไม่ให้ timezone ทำให้วันเลื่อน

export function parseISO(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: string, n: number): string {
  const x = parseISO(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toISO(x);
}

/** 0 = อาทิตย์ ... 6 = เสาร์ */
export function weekday(d: string): number {
  return parseISO(d).getUTCDay();
}

export function isWeekend(d: string): boolean {
  const w = weekday(d);
  return w === 0 || w === 6;
}

/** 'YYYY-MM' */
export function monthOf(d: string): string {
  return d.slice(0, 7);
}

export function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return toISO(d).slice(0, 7);
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
const THAI_DAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

export function thaiMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

export function thaiDayShort(d: string): string {
  return THAI_DAYS_SHORT[weekday(d)];
}

export function thaiDateLabel(d: string): string {
  const [y, m, day] = d.split('-').map(Number);
  return `${thaiDayShort(d)} ${day} ${THAI_MONTHS_SHORT[m - 1]} ${String(y + 543).slice(2)}`;
}

/** จันทร์ที่เท่าไหร่ของเดือน (1 = จันทร์แรก) */
export function nthWeekdayOfMonth(d: string): number {
  return Math.floor((Number(d.slice(8, 10)) - 1) / 7) + 1;
}
