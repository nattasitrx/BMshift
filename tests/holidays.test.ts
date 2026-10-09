import { describe, expect, it } from 'vitest';
import { parseISO } from '../src/engine/dates';
import { suggestHolidays, yearHolidays } from '../src/engine/holidayGen';
import { SEED_HOLIDAYS } from '../src/engine/seed';
import { buddhistHolidays, lunarYearStart } from '../src/engine/thaiLunar';

describe('ปฏิทินจันทรคติ: วันพระ', () => {
  // วันที่ประกาศทางการ (ปี ค.ศ.)
  const official: Record<number, Partial<Record<'makha' | 'visakha' | 'asalha' | 'lent', string>>> = {
    2010: { makha: '2010-02-28', asalha: '2010-07-26' },
    2011: { makha: '2011-02-18', asalha: '2011-07-15' },
    2012: { makha: '2012-03-07', asalha: '2012-08-02' },
    2013: { makha: '2013-02-25', asalha: '2013-07-22' },
    2014: { makha: '2014-02-14', asalha: '2014-07-11' },
    2015: { makha: '2015-03-04', asalha: '2015-07-30' },
    2016: { makha: '2016-02-22', asalha: '2016-07-19' },
    2017: { makha: '2017-02-11', asalha: '2017-07-08' },
    2018: { makha: '2018-03-01', asalha: '2018-07-27' },
    2019: { makha: '2019-02-19', asalha: '2019-07-16' },
    2020: { makha: '2020-02-08', asalha: '2020-07-05' },
    2021: { makha: '2021-02-26', asalha: '2021-07-24' },
    2022: { makha: '2022-02-16', visakha: '2022-05-15', asalha: '2022-07-13' },
    2023: { makha: '2023-03-06', visakha: '2023-06-03', asalha: '2023-08-01', lent: '2023-08-02' },
    2024: { makha: '2024-02-24', visakha: '2024-05-22', asalha: '2024-07-20', lent: '2024-07-21' },
    2025: { makha: '2025-02-12', visakha: '2025-05-11', asalha: '2025-07-10', lent: '2025-07-11' },
    2026: { makha: '2026-03-03', visakha: '2026-05-31', asalha: '2026-07-29', lent: '2026-07-30' },
  };
  for (const [y, exp] of Object.entries(official)) {
    it(`ปี ${Number(y) + 543}`, () => {
      const b = buddhistHolidays(Number(y));
      for (const [k, v] of Object.entries(exp)) expect(b[k as keyof typeof exp], k).toBe(v);
    });
  }

  it('ขึ้น 1 ค่ำเดือนอ้ายไม่คลาดจากเดือนดับทางดาราศาสตร์ ตลอดปี 2443–2743', () => {
    // เดือนดับเฉลี่ย (Meeus) เวลาไทย — ต่างจากเดือนดับจริงได้ราว ±0.6 วัน
    const newMoon = (k: number) => 2451550.09766 + 29.530588861 * k + 7 / 24;
    for (let y = 1900; y <= 2200; y++) {
      const jd = parseISO(lunarYearStart(y)).getTime() / 86400000 + 2440587.5;
      const k = Math.round((jd - 2451550.09766) / 29.530588861);
      const diff = jd - newMoon(k);
      expect(diff, String(y)).toBeGreaterThan(-1);
      expect(diff, String(y)).toBeLessThan(2);
    }
  });
});

describe('เติมวันหยุดประจำปี', () => {
  it('วันชดเชยตรงกับที่ใส่ไว้ในข้อมูลตั้งต้น', () => {
    const y2026 = yearHolidays(2026).map((h) => h.date);
    const y2027 = yearHolidays(2027).map((h) => h.date);
    for (const d of ['2026-12-05', '2026-12-07', '2026-12-10', '2026-12-31']) expect(y2026).toContain(d);
    for (const d of ['2027-01-01', '2027-04-13', '2027-10-25', '2027-12-06', '2027-12-31']) expect(y2027).toContain(d);
    // ทุกวันที่ในข้อมูลตั้งต้นของปี 2570 ระบบเติมให้ได้เอง
    for (const h of SEED_HOLIDAYS.filter((x) => x.date.startsWith('2027'))) expect(y2027, h.date).toContain(h.date);
  });

  it('วันพระและวันชดเชยข้ามวันหยุดอื่นถูกทำเครื่องหมายรอตรวจ', () => {
    const y = yearHolidays(2028);
    expect(y.filter((h) => h.name.includes('บูชา') || h.name === 'วันเข้าพรรษา').every((h) => h.pending)).toBe(true);
    expect(y.find((h) => h.name === 'วันจักรี')?.pending).toBeUndefined();
    // ชดเชยไม่ซ้อนกับวันหยุดอื่น และไม่ตกเสาร์–อาทิตย์
    const dates = y.map((h) => h.date);
    expect(new Set(dates).size).toBe(dates.length);
    for (const h of y.filter((x) => x.name.startsWith('ชดเชย'))) expect([0, 6]).not.toContain(parseISO(h.date).getUTCDay());
  });

  it('สงกรานต์และปีใหม่ติดป้ายเทศกาล รวมถึงวันชดเชย', () => {
    for (const h of yearHolidays(2028).filter((x) => x.name.includes('สงกรานต์'))) expect(h.festival).toBe('songkran');
    // 1 ม.ค. 2028 ตรงวันเสาร์ → ชดเชยวันจันทร์ 3 ม.ค. เป็นปีใหม่ด้วย
    expect(yearHolidays(2028).find((h) => h.date === '2028-01-03')).toMatchObject({ festival: 'newyear' });
  });

  it('ไม่เสนอวันที่มีอยู่แล้วหรือเคยลบออก', () => {
    const s = suggestHolidays([{ date: '2028-04-06', name: 'วันจักรี' }], ['2028-05-04'], 2028);
    expect(s.find((x) => x.holiday.date === '2028-04-06')?.exists).toBe(true);
    expect(s.find((x) => x.holiday.date === '2028-05-04')?.dismissed).toBe(true);
  });
});
