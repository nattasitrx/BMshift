import { detectBlocks } from './blocks';
import { dateRange, daysInMonth } from './dates';
import type { AppState, DayAssign, LogEntry, UndoSnapshot } from './types';

// ประวัติการจัดเวร (ใครกดอะไร) และสำเนาก่อนการกดครั้งล่าสุดสำหรับปุ่มย้อนกลับ

/** วันที่ที่การจัดเดือนนี้อาจแตะ: ทั้งเดือน + วันที่คร่อมไปเดือนถัดไปของช่วงหยุด */
function touchedDates(state: AppState, month: string): string[] {
  const set = new Set(daysInMonth(month));
  for (const b of detectBlocks(month, state.holidays)) for (const d of dateRange(b.eve, b.end)) set.add(d);
  for (const b of state.months[month]?.blocks ?? []) for (const d of dateRange(b.eve, b.end)) set.add(d);
  return [...set].sort();
}

/** บันทึกการกระทำ + เก็บสำเนาก่อนหน้าไว้ย้อนกลับ */
export function withHistory(prev: AppState, next: AppState, month: string, by: string, action: string): AppState {
  const at = new Date().toISOString();
  const dates = [...new Set([...touchedDates(prev, month), ...touchedDates(next, month)])];
  const days: Record<string, DayAssign | null> = {};
  for (const d of dates) days[d] = prev.days[d] ?? null;
  const snapshot: UndoSnapshot = { at, by, action, days, record: prev.months[month] ?? null, queues: prev.queues };
  const entry: LogEntry = { at, by, action };
  return {
    ...next,
    undo: { ...(next.undo ?? {}), [month]: snapshot },
    monthLog: { ...(next.monthLog ?? {}), [month]: [...(next.monthLog?.[month] ?? []), entry] },
  };
}

/** ย้อนกลับไปก่อนการกดครั้งล่าสุดของเดือนนี้ */
export function undoMonth(state: AppState, month: string, by: string): AppState {
  const snap = state.undo?.[month];
  if (!snap) return state;
  const days = { ...state.days };
  for (const [d, a] of Object.entries(snap.days)) {
    if (a) days[d] = a;
    else delete days[d];
  }
  const months = { ...state.months };
  if (snap.record) months[month] = snap.record;
  else delete months[month];
  const undo = { ...(state.undo ?? {}) };
  delete undo[month];
  const entry: LogEntry = { at: new Date().toISOString(), by, action: `ย้อนกลับ "${snap.action}" (ของ ${snap.by})` };
  return {
    ...state,
    days,
    months,
    queues: snap.queues,
    undo,
    monthLog: { ...(state.monthLog ?? {}), [month]: [...(state.monthLog?.[month] ?? []), entry] },
  };
}
