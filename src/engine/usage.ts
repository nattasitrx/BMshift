import { templateCells } from './blocks';
import { daysInMonth, thaiDateLabel, thaiMonthLabel } from './dates';
import type { AppState, QueueKey, Template } from './types';

// ชื่อแพทเทิร์นเสาร์–อาทิตย์แบบเข้าใจง่าย + ประวัติว่าใครอยู่อะไร เดือนไหน

const DAY_NAMES = ['ศ', 'ส', 'อา'];
const PART: Record<string, string> = { O: 'เช้า', I: 'เช้า', S: 'เช้า', PM: 'บ่าย', N: 'ดึก' };
const ORDER = ['เช้า', 'บ่าย', 'ดึก'];

export function weekendTemplate(state: AppState): Template | undefined {
  return state.templates.find((t) => t.kind === 'weekend' && t.days === 2);
}

/**
 * ตำแหน่ง A/B/C เป็นชื่อเวรจริง เช่น A = "บ่าย-เช้าดึก" (short) หรือ "ศ บ่าย · ส เช้า+ดึก" (long)
 */
export function weekendRoleLabel(state: AppState, role: string, mode: 'short' | 'long' = 'short'): string {
  const t = weekendTemplate(state);
  if (!t) return role;
  const days = ['2000-01-07', '2000-01-08', '2000-01-09'];
  const cells = templateCells({ eve: days[0], days: days.slice(1) }, t).filter((c) => c.letter === role);
  const parts = days
    .map((d, i) => {
      const names = [...new Set(cells.filter((c) => c.date === d).map((c) => PART[c.slot]))].sort(
        (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b),
      );
      if (!names.length) return '';
      return mode === 'short' ? names.join('') : `${DAY_NAMES[i]} ${names.join('+')}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(mode === 'short' ? '-' : ' · ') : role;
}

/** จำนวนเวรของตำแหน่งนั้น (ไม่นับเสริม) */
export function weekendRoleLoad(state: AppState, role: string): number {
  const t = weekendTemplate(state);
  if (!t) return 0;
  return t.rows.flat().filter((x) => x === role).length;
}

export interface HistoryEntry {
  month: string;
  /** วันแรกของเหตุการณ์ ใช้เรียง */
  date: string;
  kind: 'weekend' | 'extra' | 'adjacent' | 'midweek' | 'newyear' | 'songkran' | 'noWeekend' | 'twoWeekend';
  text: string;
}

const range = (a: string, b: string) => (a === b ? thaiDateLabel(a) : `${thaiDateLabel(a)} – ${thaiDateLabel(b)}`);

/** ทุกอย่างที่คนนี้ได้รับจากแพทเทิร์น/คิว เรียงตามเวลา */
export function personHistory(state: AppState, id: string, months: string[]): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  const inRange = new Set(months);
  for (const m of months) {
    const rec = state.months[m];
    if (!rec) continue;
    for (const b of rec.blocks) {
      const letters = Object.entries(b.people)
        .filter(([, pid]) => pid === id)
        .map(([l]) => l);
      if (b.kind === 'weekend') {
        for (const l of letters) {
          out.push({ month: m, date: b.start, kind: 'weekend', text: `ส-อา ${range(b.start, b.end)}: ${weekendRoleLabel(state, l, 'long')}` });
        }
        if (b.extraId === id) out.push({ month: m, date: b.start, kind: 'extra', text: `เวรเสริม ${range(b.start, b.end)}` });
      } else if (b.kind === 'adjacent' || b.kind === 'midweek') {
        if (letters.length) {
          const name = b.kind === 'adjacent' ? 'หยุดติดกัน' : 'หยุดไม่ติดกัน';
          out.push({ month: m, date: b.start, kind: b.kind, text: `${name} ${range(b.start, b.end)} (ตำแหน่ง ${letters.join(',')})` });
        }
      }
    }
    if (rec.noWeekend?.includes(id)) out.push({ month: m, date: `${m}-00`, kind: 'noWeekend', text: `ไม่อยู่ ส-อา ${thaiMonthLabel(m)}` });
    if (rec.twoWeekend?.includes(id)) out.push({ month: m, date: `${m}-00`, kind: 'twoWeekend', text: `อยู่ ส-อา 2 รอบ ${thaiMonthLabel(m)}` });
  }
  for (const f of state.festivals ?? []) {
    const m = f.eve.slice(0, 7);
    if (!inRange.has(m) && !inRange.has(f.start.slice(0, 7))) continue;
    const letters = Object.entries(f.people)
      .filter(([, pid]) => pid === id)
      .map(([l]) => l);
    if (letters.length) {
      out.push({
        month: m,
        date: f.start,
        kind: f.kind,
        text: `${f.kind === 'newyear' ? 'ปีใหม่' : 'สงกรานต์'} ${range(f.start, f.end)} (ตำแหน่ง ${letters.join(',')})`,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface QueueUse {
  month: string;
  text: string;
}

/** ครั้งล่าสุดที่แต่ละคนถูกใช้จากแต่ละคิว */
export function queueLastUse(state: AppState): Partial<Record<QueueKey, Map<string, QueueUse>>> {
  const out: Partial<Record<QueueKey, Map<string, QueueUse>>> = {};
  const set = (k: QueueKey, id: string, use: QueueUse) => (out[k] ??= new Map()).set(id, use);
  for (const m of Object.keys(state.months).sort()) {
    const rec = state.months[m];
    const ml = thaiMonthLabel(m);
    for (const b of rec.blocks) {
      if (b.kind === 'adjacent' || b.kind === 'midweek') {
        for (const id of new Set(Object.values(b.people))) set(b.kind, id, { month: m, text: range(b.start, b.end) });
      }
      if (b.kind === 'weekend' && b.extraId) set('extra', b.extraId, { month: m, text: range(b.start, b.end) });
    }
    for (const id of rec.noWeekend ?? []) set('noWeekend', id, { month: m, text: ml });
    for (const id of rec.twoWeekend ?? []) set('twoWeekend', id, { month: m, text: ml });
    for (const id of rec.totalPlus ?? []) set('totalExtra', id, { month: m, text: ml });
    for (const id of rec.nightPlus ?? []) set('nightExtra', id, { month: m, text: ml });
    for (const d of daysInMonth(m)) {
      const id = state.days[d]?.SMC;
      if (id) set('smc', id, { month: m, text: thaiDateLabel(d) });
    }
  }
  return out;
}
