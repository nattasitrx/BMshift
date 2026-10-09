import { addDays, daysInMonth, isWeekend, monthOf } from './dates';
import type { AppState, BlockKind, Holiday, Template } from './types';

export interface DetectedBlock {
  start: string;
  end: string;
  /** วันก่อนช่วงหยุด (บ่าย/ดึกของคืนนั้นเป็นส่วนหนึ่งของแพทเทิร์น) */
  eve: string;
  days: string[];
  kind: BlockKind;
  holidayNames: string[];
}

export function holidayMap(holidays: Holiday[]): Map<string, Holiday> {
  return new Map(holidays.map((h) => [h.date, h]));
}

export function isOffDay(d: string, holidays: Map<string, Holiday>): boolean {
  return isWeekend(d) || holidays.has(d);
}

/**
 * หาช่วงวันหยุดที่ "เป็นของ" เดือนนี้ = ช่วงที่คืนก่อนวันหยุด (eve) อยู่ในเดือนนี้
 * ช่วงที่คร่อมเดือนจะถูกจัดทั้งช่วงตอนจัดเดือนแรก
 */
export function detectBlocks(month: string, holidayList: Holiday[]): DetectedBlock[] {
  const holidays = holidayMap(holidayList);
  const monthDays = daysInMonth(month);
  const from = addDays(monthDays[0], 1);
  const to = addDays(monthDays[monthDays.length - 1], 1);
  const blocks: DetectedBlock[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isOffDay(d, holidays) || isOffDay(addDays(d, -1), holidays)) continue;
    const eve = addDays(d, -1);
    if (monthOf(eve) !== month) continue;
    const days: string[] = [];
    for (let x = d; isOffDay(x, holidays); x = addDays(x, 1)) days.push(x);
    blocks.push({
      start: days[0],
      end: days[days.length - 1],
      eve,
      days,
      kind: classify(days, holidays),
      holidayNames: days.filter((x) => holidays.has(x)).map((x) => holidays.get(x)!.name),
    });
  }
  return blocks;
}

function classify(days: string[], holidays: Map<string, Holiday>): BlockKind {
  const fest = days.map((d) => holidays.get(d)?.festival).find(Boolean);
  if (fest) return fest;
  const hasWeekend = days.some(isWeekend);
  const hasHoliday = days.some((d) => holidays.has(d));
  if (!hasWeekend) return 'midweek';
  if (!hasHoliday || days.length <= 2) return 'weekend';
  return 'adjacent';
}

export function templateLetters(t: Template): string[] {
  const set = new Set<string>();
  for (const row of t.rows) for (const c of row) if (c && c !== '*') set.add(c);
  return [...set].sort();
}

/**
 * เลือกแพทเทิร์นของช่วงวันหยุด
 * ปีใหม่: ใช้คนประมาณครึ่งหนึ่ง / สงกรานต์: ใช้คนที่เหลือจากปีใหม่ล่าสุด
 */
export function pickTemplate(
  block: DetectedBlock,
  state: AppState,
  activeCount: number,
): { template?: Template; error?: string } {
  const override = state.settings.templateOverride[block.start];
  if (override) {
    const t = state.templates.find((x) => x.id === override);
    if (t) return { template: t };
  }
  const candidates = state.templates.filter((t) => t.kind === block.kind && t.days === block.days.length);
  if (candidates.length === 0) {
    return {
      error: `ไม่มีแพทเทิร์น "${block.kind}" สำหรับ ${block.days.length} วัน (${block.start} ถึง ${block.end}) กรุณาเพิ่มในหน้าแพทเทิร์น`,
    };
  }
  if (candidates.length === 1) return { template: candidates[0] };
  let want = Math.round(activeCount / 2);
  if (block.kind === 'songkran') {
    const lastNy = lastFestivalSize(state, 'newyear', block.start);
    if (lastNy) want = activeCount - lastNy;
  }
  const sorted = [...candidates].sort((a, b) => {
    const da = Math.abs(templateLetters(a).length - want);
    const db = Math.abs(templateLetters(b).length - want);
    return da - db || templateLetters(b).length - templateLetters(a).length;
  });
  return { template: sorted[0] };
}

function lastFestivalSize(state: AppState, kind: 'newyear', before: string): number | undefined {
  let best: { start: string; size: number } | undefined;
  for (const m of Object.values(state.months)) {
    for (const b of m.blocks) {
      if (b.kind === kind && b.start < before && (!best || b.start > best.start)) {
        best = { start: b.start, size: Object.keys(b.people).length };
      }
    }
  }
  return best?.size;
}
