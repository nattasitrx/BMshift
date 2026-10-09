import { addDays, isWeekend } from './dates';
import { buddhistHolidays } from './thaiLunar';
import type { Holiday } from './types';

// สร้างวันหยุดราชการประจำปีให้อัตโนมัติ: วันที่ตายตัว + วันพระ (คำนวณจันทรคติ) + วันชดเชย
// วันหยุดพิเศษตามมติ ครม. และวันพืชมงคล (หยุดเฉพาะราชการ วันที่ไม่ตายตัว) ต้องใส่เอง

const FIXED: [string, string, Holiday['festival']?][] = [
  ['01-01', 'วันขึ้นปีใหม่', 'newyear'],
  ['04-06', 'วันจักรี'],
  ['04-13', 'วันสงกรานต์', 'songkran'],
  ['04-14', 'วันสงกรานต์', 'songkran'],
  ['04-15', 'วันสงกรานต์', 'songkran'],
  ['05-04', 'วันฉัตรมงคล'],
  ['06-03', 'วันเฉลิมพระชนมพรรษาพระราชินี'],
  ['07-28', 'วันเฉลิมพระชนมพรรษา ร.10'],
  ['08-12', 'วันแม่แห่งชาติ'],
  ['10-13', 'วันนวมินทรมหาราช'],
  ['10-23', 'วันปิยมหาราช'],
  ['12-05', 'วันพ่อแห่งชาติ'],
  ['12-10', 'วันรัฐธรรมนูญ'],
  ['12-31', 'วันสิ้นปี', 'newyear'],
];

function baseHolidays(ad: number): Holiday[] {
  const list: Holiday[] = FIXED.map(([md, name, festival]) => ({
    date: `${ad}-${md}`,
    name,
    ...(festival ? { festival } : {}),
    auto: true,
  }));
  const b = buddhistHolidays(ad);
  for (const [date, name] of [
    [b.makha, 'วันมาฆบูชา'],
    [b.visakha, 'วันวิสาขบูชา'],
    [b.asalha, 'วันอาสาฬหบูชา'],
    [b.lent, 'วันเข้าพรรษา'],
  ] as const) {
    list.push({ date, name, auto: true, pending: true });
  }
  return list;
}

/**
 * วันหยุดทั้งหมดที่ตกในปี ค.ศ. นี้ (รวมวันชดเชย)
 * วันหยุดที่ตรงเสาร์–อาทิตย์ ชดเชยวันทำงานถัดไปที่ยังไม่ใช่วันหยุด
 */
export function yearHolidays(ad: number): Holiday[] {
  const all = [ad - 1, ad, ad + 1].flatMap(baseHolidays).sort((a, b) => a.date.localeCompare(b.date));
  const taken = new Set(all.map((h) => h.date));
  const subs: Holiday[] = [];
  for (const h of all) {
    if (!isWeekend(h.date)) continue;
    let d = addDays(h.date, 1);
    let skipped = false;
    while (isWeekend(d) || taken.has(d)) {
      if (!isWeekend(d)) skipped = true;
      d = addDays(d, 1);
    }
    taken.add(d);
    subs.push({
      date: d,
      name: `ชดเชย${h.name}`,
      ...(h.festival ? { festival: h.festival } : {}),
      auto: true,
      // ชดเชยที่ต้องเลื่อนข้ามวันหยุดอื่น หรือมาจากวันพระ ให้ตรวจกับประกาศ
      ...(h.pending || skipped ? { pending: true } : {}),
    });
  }
  return [...all, ...subs]
    .filter((h) => h.date.startsWith(`${ad}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface HolidaySuggestion {
  holiday: Holiday;
  /** มีวันที่นี้อยู่แล้ว (ไม่ทับ) */
  exists: boolean;
  /** เคยถูกลบออก (ไม่เสนอซ้ำ) */
  dismissed: boolean;
}

export function suggestHolidays(current: Holiday[], dismissed: string[], ad: number): HolidaySuggestion[] {
  const have = new Set(current.map((h) => h.date));
  const gone = new Set(dismissed);
  return yearHolidays(ad).map((h) => ({ holiday: h, exists: have.has(h.date), dismissed: gone.has(h.date) }));
}
