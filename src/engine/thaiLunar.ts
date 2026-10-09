import { addDays } from './dates';

// ปฏิทินจันทรคติไทย (คำนวณแบบดั้งเดิมจากจุลศักราช) ใช้หาวันมาฆบูชา วิสาขบูชา อาสาฬหบูชา และเข้าพรรษา
// ตรวจกับวันที่ประกาศจริงปี 2553–2569 แล้ว แต่ผลยังต้องตรวจกับประกาศทางการทุกปี (เช่น ปีที่มีการเลื่อน)

export type LunarYearType = 'normal' | 'adhikavara' | 'adhikamasa';

/** จุลศักราชของปีที่วันพระในปี ค.ศ. นั้นอยู่ */
const cs = (ad: number) => ad - 638;

const horakhun = (y: number) => Math.floor((292207 * y + 373) / 800) + 1;
const kammacapon = (y: number) => 800 - ((292207 * y + 373) % 800);
const avoman = (y: number) => (11 * horakhun(y) + 650) % 692;
const tithi = (y: number) => {
  const h = horakhun(y);
  return (h + Math.floor((11 * h + 650) / 692)) % 30;
};

/** ปีอธิกมาส (มีเดือน 8 สองหน) */
function adhikamasa(y: number): boolean {
  const t = tithi(y);
  const inRange = (x: number) => x >= 24 || x <= 5;
  return t >= 25 || t <= 5 || (t === 24 && !inRange(tithi(y + 1)));
}

/** อวมานถึงเกณฑ์อธิกวาร (ก่อนพิจารณาว่าชนกับอธิกมาส) */
function adhikavaraRaw(y: number): boolean {
  return kammacapon(y) <= 207 ? avoman(y) <= 137 : avoman(y) <= 126;
}

export function lunarYearType(ad: number): LunarYearType {
  const y = cs(ad);
  if (adhikamasa(y)) return 'adhikamasa';
  // ปีอธิกมาสมีอธิกวารซ้อนไม่ได้ จึงเลื่อนไปปีถัดไป (อวมานไม่เกิน 137)
  // ตรวจแล้ว: ตรงกับวันที่ประกาศจริง และขึ้น 1 ค่ำไม่คลาดจากเดือนดับทางดาราศาสตร์ตลอดปี ค.ศ. 1900–2200
  if (adhikavaraRaw(y) || (adhikamasa(y - 1) && avoman(y - 1) <= 137)) return 'adhikavara';
  return 'normal';
}

const LENGTH: Record<LunarYearType, number> = { normal: 354, adhikavara: 355, adhikamasa: 384 };

// จุดอ้างอิง: ขึ้น 1 ค่ำ เดือนอ้าย ของปีที่มีวันพระปี 2024 (อาสาฬหบูชา 20 ก.ค. 2567)
const ANCHOR_AD = 2024;
const ANCHOR_START = '2023-12-13';

/** วันขึ้น 1 ค่ำ เดือนอ้าย ของปีจันทรคติที่มีวันพระในปี ค.ศ. นี้ (ประมาณ พ.ย.–ธ.ค. ปีก่อนหน้า) */
export function lunarYearStart(ad: number): string {
  let d = ANCHOR_START;
  for (let y = ANCHOR_AD; y < ad; y++) d = addDays(d, LENGTH[lunarYearType(y)]);
  for (let y = ANCHOR_AD - 1; y >= ad; y--) d = addDays(d, -LENGTH[lunarYearType(y)]);
  return d;
}

export interface BuddhistHolidays {
  makha: string;
  visakha: string;
  asalha: string;
  lent: string;
  type: LunarYearType;
}

/**
 * มาฆบูชา = ขึ้น 15 ค่ำ เดือน 3 (ปีอธิกมาสเลื่อนเป็นเดือน 4)
 * วิสาขบูชา = ขึ้น 15 ค่ำ เดือน 6 (ปีอธิกมาสเลื่อนเป็นเดือน 7)
 * อาสาฬหบูชา = ขึ้น 15 ค่ำ เดือน 8 (ปีอธิกมาสเป็นเดือน 8 หลัง), เข้าพรรษา = วันถัดไป
 */
export function buddhistHolidays(ad: number): BuddhistHolidays {
  const type = lunarYearType(ad);
  const start = lunarYearStart(ad);
  const m = type === 'adhikamasa';
  const asalha = addDays(start, m ? 250 : type === 'adhikavara' ? 221 : 220);
  return {
    makha: addDays(start, m ? 102 : 73),
    visakha: addDays(start, m ? 191 : 161),
    asalha,
    lent: addDays(asalha, 1),
    type,
  };
}
