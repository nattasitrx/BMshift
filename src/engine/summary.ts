import { holidayMap, isOffDay } from './blocks';
import { BIT } from './cost';
import { addDays, daysInMonth } from './dates';
import { indexRequests } from './requests';
import { SLOT_LABEL, type AppState, type DayAssign, type Holiday, type Person, type ShiftRequest, type Slot } from './types';

export interface Issue {
  date: string;
  personId: string;
  level: 'error' | 'warn';
  message: string;
}

const slotsOf = (a: DayAssign | undefined, id: string) =>
  (['O', 'I', 'S', 'PM', 'N', 'SMC'] as const).filter((s) => a?.[s] === id);

/** ตรวจตารางทั้งเดือน (ใช้ทั้งหลังจัดอัตโนมัติและหลังแก้มือ) */
export function findIssues(
  days: Record<string, DayAssign>,
  people: Person[],
  requests: ShiftRequest[],
  month: string,
  holidays: Holiday[] = [],
): Issue[] {
  const issues: Issue[] = [];
  const hol = holidayMap(holidays);
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  const req = indexRequests(requests);
  for (const d of daysInMonth(month)) {
    const next = addDays(d, 1);
    for (const p of people) {
      const s = slotsOf(days[d], p.id);
      if (!s.length) continue;
      const n = slotsOf(days[next], p.id);
      const add = (level: Issue['level'], message: string) =>
        issues.push({ date: d, personId: p.id, level, message: `${name(p.id)}: ${message}` });
      const clash = s.filter((x) => req.off(p.id, d) & BIT[x]);
      if (clash.length) add('error', `แจ้งไม่ว่าง (${clash.map((x) => SLOT_LABEL[x]).join('/')})`);
      const mornings = s.filter((x) => x === 'O' || x === 'I' || x === 'S');
      if (mornings.length > 1) add('error', 'มีเวรเช้าซ้อนกัน');
      if (s.includes('PM') && s.includes('N') && !p.canDouble) add('error', 'บ่ายต่อดึก (ไม่ได้ตั้งค่าให้อยู่ได้)');
      if (s.includes('SMC') && s.length > 1) add('error', 'SMC ซ้อนกับเวรอื่น');
      if (s.includes('N')) {
        if (n.some((x) => x === 'O' || x === 'I' || x === 'S')) add('error', 'ดึกต่อเช้า');
        if (n.includes('N')) add('error', 'ดึกติดกัน 2 คืน');
        else if (n.includes('PM') || n.includes('SMC')) add('warn', 'ดึกแล้วต่อบ่ายวันถัดไป');
      } else if (s.includes('PM') && n.includes('N') && !isOffDay(next, hol)) {
        add('warn', 'บ่ายแล้วต่อดึกวันถัดไป');
      }
    }
  }
  return issues;
}

export interface PersonSummary {
  id: string;
  name: string;
  /** เวรรวม = OPD + IPD + บ่าย + ดึก (ไม่นับเสริม/SMC) */
  total: number;
  morning: number;
  afternoon: number;
  night: number;
  extra: number;
  smc: number;
  weekendRoles: string[];
}

export function summarizeMonth(state: AppState, month: string): PersonSummary[] {
  const rows = new Map<string, PersonSummary>();
  for (const p of state.people) {
    rows.set(p.id, {
      id: p.id,
      name: p.name,
      total: 0,
      morning: 0,
      afternoon: 0,
      night: 0,
      extra: 0,
      smc: 0,
      weekendRoles: state.months[month]?.weekendRoles?.[p.id] ?? [],
    });
  }
  const bump = (id: string | undefined, f: (r: PersonSummary) => void) => {
    const r = id ? rows.get(id) : undefined;
    if (r) f(r);
  };
  for (const d of daysInMonth(month)) {
    const a = state.days[d];
    if (!a) continue;
    for (const s of ['O', 'I'] as Slot[]) bump(a[s], (r) => (r.morning++, r.total++));
    bump(a.PM, (r) => (r.afternoon++, r.total++));
    bump(a.N, (r) => (r.night++, r.total++));
    bump(a.S, (r) => r.extra++);
    bump(a.SMC, (r) => r.smc++);
  }
  return state.people.filter((p) => p.active || rows.get(p.id)!.total > 0).map((p) => rows.get(p.id)!);
}
