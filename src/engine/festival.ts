import { detectBlocks, holidayMap, isOffDay, pickTemplate, templateCells, templateLetters, type DetectedBlock } from './blocks';
import { BIT, maskCost, type CostCtx } from './cost';
import { addDays, dateRange, shiftMonth } from './dates';
import { normalizeQueues, takeFromQueue } from './generate';
import { mulberry32, shuffle } from './rng';
import { SLOTS, type AppState, type DayAssign, type FestivalRecord, type ShiftRequest, type Template } from './types';

// ปีใหม่/สงกรานต์จัดแยกจากการจัดรายเดือน: เลือกแพทเทิร์น หยิบคนจากคิวเทศกาล แล้วบันทึกเป็นเวรตายตัว
// ตอนจัดรายเดือน เวรเหล่านี้นับเข้ายอดของแต่ละคนก่อน แล้วค่อยเฉลี่ยเวรที่เหลือ

export type FestivalBlock = DetectedBlock & { kind: 'newyear' | 'songkran' };

export function listFestivalBlocks(state: AppState, fromMonth: string, months: number): FestivalBlock[] {
  const out: FestivalBlock[] = [];
  for (let k = 0; k < months; k++) {
    for (const b of detectBlocks(shiftMonth(fromMonth, k), state.holidays)) {
      if (b.kind === 'newyear' || b.kind === 'songkran') out.push(b as FestivalBlock);
    }
  }
  return out;
}

export function findFestival(state: AppState, b: { kind: string; start: string; end: string }) {
  return (state.festivals ?? []).find((f) => f.kind === b.kind && f.start <= b.end && f.end >= b.start);
}

export function festivalTemplates(state: AppState, b: FestivalBlock): Template[] {
  return state.templates.filter((t) => t.kind === b.kind && t.days === b.days.length);
}

function cellsOf(f: Pick<FestivalRecord, 'eve' | 'start' | 'end'>, t: Template) {
  return templateCells({ eve: f.eve, days: dateRange(f.start, f.end) }, t);
}

/** เอาเวรของเทศกาลเดิมออกจากตาราง (เฉพาะช่องที่ยังเป็นคนเดิม) */
export function clearFestivalCells(state: AppState, days: Record<string, DayAssign>, f: FestivalRecord) {
  const t = state.templates.find((x) => x.id === f.templateId);
  if (!t) return;
  for (const c of cellsOf(f, t)) {
    const a = days[c.date];
    if (a && a[c.slot] === f.people[c.letter]) {
      const next = { ...a };
      delete next[c.slot];
      days[c.date] = next;
    }
  }
}

export function writeFestivalCells(state: AppState, days: Record<string, DayAssign>, f: FestivalRecord) {
  const t = state.templates.find((x) => x.id === f.templateId);
  if (!t) return;
  for (const c of cellsOf(f, t)) {
    const id = f.people[c.letter];
    if (id) days[c.date] = { ...(days[c.date] ?? {}), [c.slot]: id };
  }
}

export interface ArrangeResult {
  state: AppState;
  festival: FestivalRecord;
  warnings: string[];
}

export function arrangeFestival(
  state: AppState,
  requests: ShiftRequest[],
  block: FestivalBlock,
  opts: { templateId?: string; seed?: number } = {},
): ArrangeResult | { error: string } {
  const rng = mulberry32(opts.seed ?? Date.now());
  const active = state.people.filter((p) => p.active);
  const activeSet = new Set(active.map((p) => p.id));
  const existing = findFestival(state, block);
  const others = (state.festivals ?? []).filter((f) => f !== existing);

  let template: Template | undefined;
  if (opts.templateId) template = state.templates.find((t) => t.id === opts.templateId);
  else template = pickTemplate(block, { ...state, festivals: others }, active.length).template;
  if (!template) {
    return { error: `ไม่มีแพทเทิร์น${block.kind === 'newyear' ? 'ปีใหม่' : 'สงกรานต์'} ${block.days.length} วัน — เพิ่มในหน้าตั้งค่า` };
  }

  const letters = templateLetters(template);
  const span = [block.eve, ...block.days];
  const off = new Map<string, Set<string>>();
  const want = new Map<string, Set<string>>();
  for (const r of requests) {
    const m = r.type === 'off' ? off : want;
    if (!m.has(r.personId)) m.set(r.personId, new Set());
    m.get(r.personId)!.add(r.date);
  }
  const free = (id: string) => activeSet.has(id) && !span.some((d) => off.get(id)?.has(d));

  const queueBefore = existing?.queueBefore ?? normalizeQueues(state.queues, state.people.map((p) => p.id)).festival;
  const queue = [...queueBefore];
  const picked = takeFromQueue(queue, letters.length, [free, (id) => activeSet.has(id)]);
  if (picked.length < letters.length) return { error: `คนไม่พอ (ต้องการ ${letters.length} คน)` };
  const warnings = picked.filter((id) => !free(id)).map((id) => `${nameOf(state, id)} แจ้งไม่ว่างในช่วงนี้ แต่ถึงคิว`);

  const days: Record<string, DayAssign> = JSON.parse(JSON.stringify(state.days));
  if (existing) clearFestivalCells(state, days, existing);

  // เลือกว่าใครเป็น A, B, C… ให้ขัดกับเวรรอบข้างน้อยที่สุด
  const dates = dateRange(addDays(block.eve, -3), addDays(block.end, 3));
  const idx = new Map(dates.map((d, i) => [d, i]));
  const hol = holidayMap(state.holidays);
  const plainDay = new Set<number>();
  const offDay = new Set<number>();
  dates.forEach((d, i) => {
    if (isOffDay(d, hol)) offDay.add(i);
    else if (!isOffDay(addDays(d, 1), hol)) plainDay.add(i);
  });
  const base = new Map<string, number[]>();
  const ctx = new Map<string, CostCtx>();
  for (const id of picked) {
    const m = dates.map((d) => {
      let x = 0;
      for (const s of [...SLOTS, 'SMC'] as const) if (days[d]?.[s] === id) x |= BIT[s];
      return x;
    });
    base.set(id, m);
    const toIdx = (s?: Set<string>) => new Set([...(s ?? [])].map((d) => idx.get(d)).filter((x): x is number => x !== undefined));
    const p = state.people.find((x) => x.id === id)!;
    ctx.set(id, { off: toIdx(off.get(id)), want: toIdx(want.get(id)), canDouble: p.canDouble, plainDay, offDay });
  }
  const cells = templateCells(block, template);
  let best: Record<string, string> = {};
  let bestCost = Infinity;
  for (let k = 0; k < 800; k++) {
    const perm = shuffle(rng, picked);
    const map: Record<string, string> = {};
    letters.forEach((l, i) => (map[l] = perm[i]));
    let cost = 0;
    for (const id of picked) {
      const m = [...base.get(id)!];
      for (const c of cells) if (map[c.letter] === id && idx.has(c.date)) m[idx.get(c.date)!] |= BIT[c.slot];
      cost += maskCost(m, ctx.get(id)!);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = map;
    }
  }

  const festival: FestivalRecord = {
    start: block.start,
    end: block.end,
    eve: block.eve,
    kind: block.kind,
    templateId: template.id,
    people: best,
    arrangedAt: new Date().toISOString(),
    queueBefore,
  };
  writeFestivalCells(state, days, festival);

  const festivals = [...others, festival].sort((a, b) => a.start.localeCompare(b.start));
  const isLatest = festivals[festivals.length - 1] === festival;
  return {
    festival,
    warnings,
    state: {
      ...state,
      days,
      festivals,
      queues: isLatest ? { ...state.queues, festival: queue } : state.queues,
    },
  };
}

/** เปลี่ยนคนในตำแหน่ง (ตัวอักษร) ของเทศกาล */
export function setFestivalPerson(state: AppState, f: FestivalRecord, letter: string, personId: string): AppState {
  const days: Record<string, DayAssign> = JSON.parse(JSON.stringify(state.days));
  clearFestivalCells(state, days, f);
  const updated: FestivalRecord = { ...f, people: { ...f.people, [letter]: personId } };
  writeFestivalCells(state, days, updated);
  return { ...state, days, festivals: state.festivals.map((x) => (x === f ? updated : x)) };
}

/** ลบการจัดเทศกาล และคืนคิวเทศกาลถ้าเป็นการจัดล่าสุด */
export function removeFestival(state: AppState, f: FestivalRecord): AppState {
  const days: Record<string, DayAssign> = JSON.parse(JSON.stringify(state.days));
  clearFestivalCells(state, days, f);
  const festivals = state.festivals.filter((x) => x !== f);
  const wasLatest = !festivals.some((x) => x.start > f.start);
  return {
    ...state,
    days,
    festivals,
    queues: wasLatest ? { ...state.queues, festival: f.queueBefore } : state.queues,
  };
}

function nameOf(state: AppState, id: string) {
  return state.people.find((p) => p.id === id)?.name ?? id;
}
