import { daysInMonth } from './dates';
import type { AppState, PayRate, Slot } from './types';

// ใบเวรน้อย: เวรแต่ละวันของแต่ละคน × ค่าเวร

export const DEFAULT_PAY_RATES: PayRate[] = [{ from: '2000-01', amount: 820 }];

export function rateFor(state: AppState, month: string): number {
  const rates = [...(state.settings.payRates ?? DEFAULT_PAY_RATES)].sort((a, b) => a.from.localeCompare(b.from));
  let amount = rates[0]?.amount ?? 0;
  for (const r of rates) if (r.from <= month) amount = r.amount;
  return amount;
}

export const PAY_LABEL: Record<Slot | 'SMC', string> = {
  O: 'เช้า (OPD)',
  I: 'เช้า (IPD)',
  S: 'เช้า (เสริม)',
  PM: 'บ่าย',
  N: 'ดึก',
  SMC: 'SMC',
};

export interface SlipRow {
  date: string;
  slots: (Slot | 'SMC')[];
  /** จำนวนเวรที่นับค่าเวรในวันนั้น */
  count: number;
}

export interface Slip {
  personId: string;
  month: string;
  rows: SlipRow[];
  count: number;
  rate: number;
  total: number;
}

export function paidSlots(state: AppState): (Slot | 'SMC')[] {
  return [
    'O',
    'I',
    ...(state.settings.payCountExtra === false ? [] : (['S'] as const)),
    'PM',
    'N',
    ...(state.settings.payCountSmc ? (['SMC'] as const) : []),
  ];
}

export function slipFor(state: AppState, month: string, personId: string): Slip {
  const paid = new Set(paidSlots(state));
  const rows: SlipRow[] = [];
  for (const d of daysInMonth(month)) {
    const a = state.days[d];
    if (!a) continue;
    const slots = (['O', 'I', 'S', 'PM', 'N', 'SMC'] as const).filter((s) => a[s] === personId);
    if (!slots.length) continue;
    rows.push({ date: d, slots, count: slots.filter((s) => paid.has(s)).length });
  }
  const count = rows.reduce((n, r) => n + r.count, 0);
  const rate = rateFor(state, month);
  return { personId, month, rows, count, rate, total: count * rate };
}

export function baht(n: number): string {
  return n.toLocaleString('th-TH');
}
