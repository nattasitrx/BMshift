import { detectBlocks, holidayMap, isOffDay, pickTemplate, templateCells, templateLetters, type Cell, type DetectedBlock } from './blocks';
import { BIT, COUNTED, maskCost, popcount, type CostCtx } from './cost';
import { addDays, dateRange, daysInMonth, monthOf, nthWeekdayOfMonth, thaiDateLabel, weekday } from './dates';
import { mulberry32, randInt, shuffle, type Rng } from './rng';
import { holidaySignature } from './holidayCheck';
import { indexRequests } from './requests';
import { findIssues } from './summary';
import {
  SLOTS,
  type AppState,
  type BlockRecord,
  type DayAssign,
  type GenerateMode,
  type MonthRecord,
  type QueueKey,
  type Queues,
  type ShiftRequest,
  type Stage,
  type Template,
  type WeekendRole,
} from './types';

export const QUEUE_KEYS: QueueKey[] = [
  'adjacent', 'midweek', 'festival', 'twoWeekend', 'noWeekend', 'extra', 'smc', 'totalExtra', 'nightExtra',
];

export interface GenerateOptions {
  seed?: number;
  iterations?: number;
  /** all = จัดใหม่ทั้งเดือน, holiday = เฉพาะวันหยุดราชการ, extra = เฉพาะเวรเสริม, weekend = เสาร์–อาทิตย์, rest = วันธรรมดา+SMC */
  mode?: GenerateMode;
}

const STAGE_QUEUES: Record<Stage, QueueKey[]> = {
  holiday: ['adjacent', 'midweek'],
  extra: ['extra'],
  weekend: ['twoWeekend', 'noWeekend'],
  rest: ['totalExtra', 'nightExtra', 'smc'],
};
export const STAGE_ORDER: Stage[] = ['holiday', 'extra', 'weekend', 'rest'];
const isFestival = (k: string) => k === 'newyear' || k === 'songkran';

export function stagesOf(rec: MonthRecord | undefined): Stage[] {
  if (!rec) return [];
  const st = rec.stages ?? STAGE_ORDER;
  // ข้อมูลก่อนแยกขั้นวันหยุดราชการ: ขั้นเสาร์–อาทิตย์เดิมรวมวันหยุดราชการไว้ด้วย
  return st.includes('weekend') && !st.includes('holiday') ? ['holiday', ...st] : st;
}

/** ล้างเวรของเดือน (ยกเว้นวันที่เป็นของช่วงหยุดที่เดือนก่อนจัดไว้) แล้วใส่ปีใหม่/สงกรานต์ที่จัดแยกไว้กลับ */
export function clearedDays(state: AppState, month: string): Record<string, DayAssign> {
  const days = clone(state.days);
  const mDays = daysInMonth(month);
  const kept = new Set<string>();
  for (const [m, rec] of Object.entries(state.months)) {
    if (m === month) continue;
    for (const b of rec.blocks) {
      if (isFestival(b.kind)) continue;
      for (const d of dateRange(b.start, b.end)) if (monthOf(d) === month) kept.add(d);
    }
  }
  const removed = new Set<string>(mDays.filter((d) => !kept.has(d)));
  for (const b of state.months[month]?.blocks ?? []) {
    for (const d of dateRange(b.start, b.end)) if (monthOf(d) !== month) removed.add(d);
  }
  for (const d of removed) delete days[d];
  for (const f of state.festivals ?? []) {
    const t = state.templates.find((x) => x.id === f.templateId);
    if (!t) continue;
    for (const c of templateCells({ eve: f.eve, days: dateRange(f.start, f.end) }, t)) {
      const id = f.people[c.letter];
      if (id && removed.has(c.date)) days[c.date] = { ...(days[c.date] ?? {}), [c.slot]: id };
    }
  }
  return days;
}

/** ล้างทั้งเดือน: เวร บันทึกการจัด และคืนคิวไปก่อนเดือนนี้ (ถ้าเป็นเดือนล่าสุดที่จัด) */
export function clearMonth(state: AppState, month: string): AppState {
  const rec = state.months[month];
  const days = clearedDays(state, month);
  const months = { ...state.months };
  delete months[month];
  const latest = Object.keys(state.months).sort().pop();
  return {
    ...state,
    days,
    months,
    queues: rec && latest === month ? clone(rec.queuesBefore) : state.queues,
  };
}

export interface GenerateResult {
  days: Record<string, DayAssign>;
  record: MonthRecord;
  queues: Queues;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** ตัดรายชื่อที่ไม่มีแล้วออก และต่อคนใหม่ไว้ท้ายคิว (คนที่พักงานยังอยู่ในคิว แต่จะถูกข้าม) */
export function normalizeQueues(q: Partial<Queues>, ids: string[]): Queues {
  const out = {} as Queues;
  const known = new Set(ids);
  for (const key of QUEUE_KEYS) {
    const list = [...new Set((q[key] ?? []).filter((id) => known.has(id)))];
    for (const id of ids) if (!list.includes(id)) list.push(id);
    out[key] = list;
  }
  return out;
}

/**
 * หยิบคนจากหัวคิว n คน โดยลองเงื่อนไขทีละระดับ (เข้มก่อน แล้วค่อยผ่อน)
 * คนที่ถูกหยิบย้ายไปท้ายคิว คนที่ถูกข้ามยังอยู่หัวคิวรอรอบถัดไป
 */
export function takeFromQueue(queue: string[], n: number, tiers: ((id: string) => boolean)[]): string[] {
  const picked: string[] = [];
  for (const ok of tiers) {
    for (const id of queue) {
      if (picked.length >= n) break;
      if (!picked.includes(id) && ok(id)) picked.push(id);
    }
    if (picked.length >= n) break;
  }
  for (const id of picked) {
    queue.splice(queue.indexOf(id), 1);
    queue.push(id);
  }
  return picked;
}

export function defaultSmcDays(month: string, holidays: AppState['holidays']): string[] {
  const hol = holidayMap(holidays);
  return daysInMonth(month).filter((d) => {
    if (hol.has(d)) return false;
    const w = weekday(d);
    return w === 3 || (w === 1 && [1, 3].includes(nthWeekdayOfMonth(d)));
  });
}

export function generateMonth(
  state: AppState,
  requests: ShiftRequest[],
  month: string,
  opts: GenerateOptions = {},
): GenerateResult {
  const rng: Rng = mulberry32(opts.seed ?? Date.now());
  const mode: GenerateMode = opts.mode ?? 'all';
  const old = state.months[month];
  const oldStages = stagesOf(old);
  // ขั้นที่ล้างทั้งเดือน (วันหยุดราชการ / เสาร์–อาทิตย์) เก็บผลของขั้นที่จัดไว้ก่อน
  const keepExtra = (mode === 'weekend' || mode === 'holiday') && oldStages.includes('extra');
  // วันหยุดเปลี่ยนหลังจัด → จัดวันหยุดราชการใหม่ด้วย ไม่เก็บของเดิม
  const sig = holidaySignature(state.holidays, month);
  const sameHolidays = !old?.holidaysUsed || JSON.stringify(old.holidaysUsed) === JSON.stringify(sig);
  const keepHoliday = mode === 'weekend' && oldStages.includes('holiday') && sameHolidays;
  const runs: Stage[] =
    mode === 'all'
      ? STAGE_ORDER
      : mode === 'weekend'
        ? [...(keepHoliday ? [] : (['holiday'] as Stage[])), ...(keepExtra ? [] : (['extra'] as Stage[])), 'weekend']
        : [mode];
  const notes: NonNullable<MonthRecord['notes']> =
    mode === 'all' ? {} : clone(old?.notes ?? (old ? { weekend: { info: old.info, warnings: [] } } : {}));
  if (mode === 'weekend' || mode === 'holiday') delete notes.rest;
  if (mode === 'holiday') delete notes.weekend;
  for (const st of runs) notes[st] = { info: [], warnings: [] };
  let stage: Stage = runs[0];
  const note = (m: string) => notes[stage]!.info.push(m);
  const warn = (m: string) => notes[stage]!.warnings.push(m);
  const allIds = state.people.map((p) => p.id);
  const active = state.people.filter((p) => p.active);
  const activeIds = active.map((p) => p.id);
  const activeSet = new Set(activeIds);
  const isActive = (id: string) => activeSet.has(id);
  const nameOf = (id: string) => state.people.find((p) => p.id === id)?.name ?? id;
  // คิว: ขั้นที่จัดรอบนี้เริ่มจากคิวก่อนเดือนนี้ ขั้นอื่นใช้คิวหลังจัดครั้งก่อน
  const queuesBefore = normalizeQueues(clone(old?.queuesBefore ?? state.queues), allIds);
  const q = mode === 'all' || !old ? clone(queuesBefore) : normalizeQueues(clone(old.queuesAfter), allIds);
  for (const st of runs) for (const k of STAGE_QUEUES[st]) q[k] = clone(queuesBefore[k]);
  const holidays = holidayMap(state.holidays);
  const mDays = daysInMonth(month);
  const first = mDays[0];
  const last = mDays[mDays.length - 1];
  const oldExtra = new Map((old?.blocks ?? []).filter((b) => b.kind === 'weekend' && b.extraId).map((b) => [b.start, b.extraId!]));

  // ---- 1. ล้างส่วนที่จะจัดใหม่ ----
  let days: Record<string, DayAssign>;
  if (mode === 'all' || mode === 'weekend' || mode === 'holiday') {
    days = clearedDays(state, month);
    // ใส่ผลของขั้นที่เก็บไว้กลับ: เวรเสริม และวันหยุดราชการ
    if (keepExtra) {
      for (const b of old?.blocks ?? []) {
        if (b.kind !== 'weekend' || !b.extraId) continue;
        for (const d of dateRange(b.start, b.end)) days[d] = { ...(days[d] ?? {}), S: b.extraId };
      }
    }
    if (keepHoliday) {
      for (const b of old?.blocks ?? []) {
        if (b.kind !== 'adjacent' && b.kind !== 'midweek') continue;
        const t = state.templates.find((x) => x.id === b.templateId);
        if (!t) continue;
        for (const c of templateCells({ eve: b.eve, days: dateRange(b.start, b.end) }, t)) {
          const id = b.people[c.letter];
          if (id) days[c.date] = { ...(days[c.date] ?? {}), [c.slot]: id };
        }
      }
    }
  } else {
    days = clone(state.days);
    // คืนก่อนวันหยุด (รวมปีใหม่/สงกรานต์) เป็นของแพทเทิร์น ไม่ล้าง
    const eves = new Set([...(old?.blocks ?? []), ...(state.festivals ?? [])].map((b) => b.eve));
    for (const d of mDays) {
      const a = days[d];
      if (!a) continue;
      const next = { ...a };
      if (mode === 'rest') {
        delete next.SMC;
        if (!isOffDay(d, holidays) && !eves.has(d)) {
          delete next.PM;
          delete next.N;
        }
      }
      days[d] = next;
    }
    if (mode === 'extra') {
      for (const b of detectBlocks(month, state.holidays).filter((x) => x.kind === 'weekend')) {
        for (const d of b.days) {
          if (!days[d]?.S) continue;
          const next = { ...days[d] };
          delete next.S;
          days[d] = next;
        }
      }
    }
  }

  const req = indexRequests(requests);
  /** แจ้งไม่ว่างเวรนี้ (bit) ในวันนั้น */
  const isOff = (id: string, d: string, bits: number) => (req.off(id, d) & bits) !== 0;

  // ---- ช่วงวันที่ใช้คำนวณ (เผื่อก่อน/หลังเดือนเพื่อตรวจเวรต่อเนื่อง) ----
  const dates = dateRange(addDays(first, -3), addDays(last, 10));
  const idx = new Map(dates.map((d, i) => [d, i]));
  const monthIdx = mDays.map((d) => idx.get(d)!);
  const plainDay = new Set<number>();
  const offDay = new Set<number>();
  dates.forEach((d, i) => {
    if (isOffDay(d, holidays)) offDay.add(i);
    else if (!isOffDay(addDays(d, 1), holidays)) plainDay.add(i);
  });
  const ctx = new Map<string, CostCtx>();
  for (const p of active) {
    const off = new Map<number, number>();
    const want = new Map<number, number>();
    dates.forEach((d, i) => {
      if (req.off(p.id, d)) off.set(i, req.off(p.id, d));
      if (req.want(p.id, d)) want.set(i, req.want(p.id, d));
    });
    ctx.set(p.id, { off, want, canDouble: p.canDouble, plainDay, offDay });
  }

  const buildMasks = () => {
    const masks = new Map<string, number[]>();
    for (const id of allIds) masks.set(id, new Array(dates.length).fill(0));
    dates.forEach((d, i) => {
      const a = days[d];
      if (!a) return;
      for (const s of [...SLOTS, 'SMC'] as const) {
        const id = a[s];
        if (id && masks.has(id)) masks.get(id)![i] |= BIT[s];
      }
    });
    return masks;
  };
  const costWith = (id: string, base: number[], extra: { i: number; bit: number }[]) => {
    const m = [...base];
    for (const e of extra) m[e.i] |= e.bit;
    return maskCost(m, ctx.get(id)!);
  };

  const writeCells = (cells: Cell[], people: Record<string, string>, extraId?: string) => {
    for (const c of cells) {
      const id = c.letter === '*' ? extraId : people[c.letter];
      if (!id) continue;
      days[c.date] = { ...(days[c.date] ?? {}), [c.slot]: id };
    }
  };

  const blocks = detectBlocks(month, state.holidays);
  const records: BlockRecord[] =
    mode === 'extra' || mode === 'rest'
      ? clone(old?.blocks ?? [])
      : [
          // เก็บวันหยุดราชการ / เวรเสริมที่จัดไว้ก่อน
          ...(keepHoliday ? clone((old?.blocks ?? []).filter((b) => b.kind === 'adjacent' || b.kind === 'midweek')) : []),
          ...(keepExtra && mode === 'holiday'
            ? (old?.blocks ?? []).filter((b) => b.kind === 'weekend' && b.extraId).map((b) => ({ ...clone(b), people: {} }))
            : []),
        ];
  const holidayUsed = new Set<string>();
  const weekendExempt = new Set<string>();
  const festivals = state.festivals ?? [];
  const doWeekend = runs.includes('weekend');
  const doHoliday = runs.includes('holiday');
  if (keepHoliday) {
    for (const b of records) {
      if (b.kind !== 'adjacent' && b.kind !== 'midweek') continue;
      for (const id of Object.values(b.people)) holidayUsed.add(id);
      if (b.kind === 'adjacent') for (const id of Object.values(b.people)) weekendExempt.add(id);
    }
  }

  // ---- 2. ช่วงวันหยุดราชการ (ใช้คิวของแต่ละประเภท) ----
  // เทศกาลมาก่อน เพื่อให้คิววันหยุดอื่นเลี่ยงคนที่อยู่เทศกาลเดือนนี้แล้ว
  const holidayBlocks = [
    ...blocks.filter((x) => isFestival(x.kind)),
    ...blocks.filter((x) => x.kind !== 'weekend' && !isFestival(x.kind)),
  ];
  if (doHoliday || doWeekend) stage = doHoliday ? 'holiday' : 'weekend';
  for (const b of doHoliday || doWeekend ? holidayBlocks : []) {
    if (b.kind === 'newyear' || b.kind === 'songkran') {
      const name = b.kind === 'newyear' ? 'ปีใหม่' : 'สงกรานต์';
      const range = `${thaiDateLabel(b.start)} – ${thaiDateLabel(b.end)}`;
      const f = festivals.find((x) => x.kind === b.kind && x.start <= b.end && x.end >= b.start);
      if (!f) {
        warn(`ยังไม่ได้จัด${name} (${range}) — จัดในแท็บ "เทศกาล" ก่อน แล้วค่อยจัดเดือนนี้`);
        continue;
      }
      const ids = [...new Set(Object.values(f.people))];
      ids.forEach((id) => holidayUsed.add(id));
      if (state.settings.festivalCountsAsWeekend) ids.forEach((id) => weekendExempt.add(id));
      note(`${name} (${range}) จัดแยกไว้แล้ว: ${ids.map(nameOf).join(', ')} — นำมาหักออกจากยอดเวรแล้ว`);
      continue;
    }
    if (!doHoliday) continue;
    const { template, error } = pickTemplate(b, state, active.length);
    if (!template) {
      warn(error!);
      continue;
    }
    const letters = templateLetters(template);
    const key: QueueKey = b.kind === 'adjacent' ? 'adjacent' : 'midweek';
    const span = [b.eve, ...b.days];
    // เข้มสุด: ไม่ได้แจ้งอะไรในช่วงนี้ → ผ่อน: ไม่ได้แจ้งไม่ว่างทั้งวัน (ส่วนแจ้งรายเวรให้ตอนจัดตำแหน่งเลี่ยงเอง)
    const free = (id: string) => isActive(id) && !span.some((d) => req.anyOff(id, d));
    const notFullOff = (id: string) => isActive(id) && !span.some((d) => req.fullDay(id, d));
    const picked = takeFromQueue(q[key], letters.length, [
      (id) => free(id) && !holidayUsed.has(id),
      free,
      notFullOff,
      isActive,
    ]);
    const label = `${template.label} (${thaiDateLabel(b.start)} – ${thaiDateLabel(b.end)})`;
    if (picked.length < letters.length) {
      warn(`คนไม่พอสำหรับ ${label}`);
      continue;
    }
    for (const id of picked) if (!notFullOff(id)) warn(`${nameOf(id)} ขอไม่ว่างในช่วง ${label} แต่จำเป็นต้องใช้`);
    const people = assignLetters(b, template, letters, picked);
    writeCells(templateCells(b, template), people);
    picked.forEach((id) => holidayUsed.add(id));
    if (b.kind === 'adjacent') picked.forEach((id) => weekendExempt.add(id));
    note(`${label}: ${letters.map((l) => `${l}=${nameOf(people[l])}`).join(', ')}`);
    records.push({ start: b.start, end: b.end, eve: b.eve, kind: b.kind, templateId: template.id, people });
  }

  function assignLetters(b: DetectedBlock, t: Template, letters: string[], picked: string[]) {
    const masks = buildMasks();
    const cells = templateCells(b, t);
    let best: Record<string, string> = {};
    let bestCost = Infinity;
    const tries = Math.min(600, factorial(letters.length));
    for (let k = 0; k < tries; k++) {
      const perm = shuffle(rng, picked);
      const map: Record<string, string> = {};
      letters.forEach((l, i) => (map[l] = perm[i]));
      let cost = 0;
      for (const id of picked) {
        const extra = cells
          .filter((c) => map[c.letter] === id && idx.has(c.date))
          .map((c) => ({ i: idx.get(c.date)!, bit: BIT[c.slot] }));
        cost += costWith(id, masks.get(id)!, extra);
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = map;
      }
    }
    return best;
  }

  // ---- 3. เสาร์–อาทิตย์ปกติ ----
  if (doWeekend) stage = 'weekend';
  // จัดวันหยุดราชการใหม่ = ล้างเสาร์–อาทิตย์ด้วย (คนที่อยู่หยุดติดกันไม่ต้องอยู่ ส-อา จึงต้องจัดใหม่ตาม)
  const clearsWeekend = doWeekend || mode === 'holiday';
  const weekendRoles: Record<string, WeekendRole[]> = clearsWeekend ? {} : clone(old?.weekendRoles ?? {});
  let noWeekend: string[] = clearsWeekend ? [] : (old?.noWeekend ?? []);
  let totalPlusIds: string[] = old?.totalPlus ?? [];
  let nightPlusIds: string[] = old?.nightPlus ?? [];
  let twoWeekend: string[] = clearsWeekend ? [] : (old?.twoWeekend ?? []);
  const wkBlocks = blocks.filter((x) => x.kind === 'weekend');
  const wt = state.templates.find((t) => t.kind === 'weekend' && t.days === 2);
  if (wkBlocks.length && !wt && (doWeekend || mode === 'extra')) warn('ไม่มีแพทเทิร์นเสาร์–อาทิตย์ปกติ');
  // เวรเสริมที่จัดไว้ก่อน: ใส่กลับก่อนจัด A/B/C เพื่อไม่ให้คนเดียวกันได้ตำแหน่งในสุดสัปดาห์นั้น
  if (doWeekend && keepExtra && wt) {
    for (const b of wkBlocks) {
      const id = oldExtra.get(b.start);
      if (id) writeCells(templateCells(b, wt), {}, id);
    }
  }
  if (doWeekend && wkBlocks.length && wt) {
    const roles = templateLetters(wt);
    const R = roles.length;
    const slots = wkBlocks.length * R;
    const pool = activeIds.filter((id) => !weekendExempt.has(id));
    if (weekendExempt.size) note(`อยู่หยุดติดกันแล้ว ไม่ต้องอยู่ ส-อา: ${[...weekendExempt].map(nameOf).join(', ')}`);
    let list = [...pool];
    if (pool.length > slots) {
      const skip = takeFromQueue(q.noWeekend, pool.length - slots, [(id) => pool.includes(id)]);
      list = pool.filter((id) => !skip.includes(id));
      noWeekend = skip;
      note(`ไม่อยู่ ส-อา เดือนนี้ (ตามคิว): ${skip.map(nameOf).join(', ')}`);
    } else if (pool.length < slots && pool.length > 0) {
      let need = slots - pool.length;
      const doubles: string[] = [];
      while (need > 0) {
        // เลี่ยงคนที่มีเวรวันหยุดราชการในเดือนนี้แล้ว (ยังอยู่หัวคิวรอรอบหน้า)
        const take = takeFromQueue(q.twoWeekend, Math.min(need, pool.length), [
          (id) => pool.includes(id) && !holidayUsed.has(id) && !doubles.includes(id),
          (id) => pool.includes(id) && !doubles.includes(id),
          (id) => pool.includes(id),
        ]);
        if (!take.length) break;
        doubles.push(...take);
        need -= take.length;
      }
      list.push(...doubles);
      twoWeekend = doubles;
      note(`อยู่ ส-อา 2 รอบ (คิว 2 wk): ${doubles.map(nameOf).join(', ')}`);
    }
    if (list.length < slots) warn(`คนไม่พอสำหรับเสาร์–อาทิตย์ (ต้องการ ${slots} ได้ ${list.length})`);

    const arr = solveWeekends(wkBlocks, wt, roles, list);
    wkBlocks.forEach((b, w) => {
      const people: Record<string, string> = {};
      roles.forEach((r, k) => {
        const id = arr[w * R + k];
        if (!id) return;
        people[r] = id;
        (weekendRoles[id] ??= []).push(r as WeekendRole);
      });
      writeCells(templateCells(b, wt), people);
      records.push({ start: b.start, end: b.end, eve: b.eve, kind: 'weekend', templateId: wt.id, people });
    });

    // เวรเสริมจากคิว คนละ 1 สุดสัปดาห์
    if (keepExtra) {
      for (const b of wkBlocks) {
        const rec = records.find((r) => r.start === b.start)!;
        rec.extraId = oldExtra.get(b.start);
      }
    } else if (wt.rows.some((row) => row.includes('*'))) {
      stage = 'extra';
      assignExtras((w) => new Set(arr.slice(w * R, w * R + R)));
      stage = 'weekend';
    }
  }

  // เฉพาะเวรเสริม: ไม่แตะเวรอื่น
  if (mode === 'extra' && wt && wkBlocks.length) {
    assignExtras((w) => {
      const b = wkBlocks[w];
      const ids = new Set<string>();
      for (const d of [b.eve, ...b.days]) for (const s of SLOTS) if (days[d]?.[s]) ids.add(days[d]![s]!);
      return ids;
    });
  }

  function assignExtras(inPatternOf: (w: number) => Set<string>) {
    if (!wt) return;
    {
      const masks = buildMasks();
      wkBlocks.forEach((b, w) => {
        const inPattern = inPatternOf(w);
        const free = (id: string) => {
          if (!isActive(id) || inPattern.has(id)) return false;
          const m = masks.get(id)!;
          if (b.days.some((d) => isOff(id, d, BIT.S) || m[idx.get(d)!])) return false;
          return !(m[idx.get(b.eve)!] & BIT.N);
        };
        const [extraId] = takeFromQueue(q.extra, 1, [free, (id) => isActive(id) && !inPattern.has(id)]);
        if (!extraId) {
          warn(`หาเวรเสริมไม่ได้ ${thaiDateLabel(b.start)}`);
          return;
        }
        if (!free(extraId)) warn(`${nameOf(extraId)} ได้เวรเสริม ${thaiDateLabel(b.start)} แม้ติดเงื่อนไข`);
        writeCells(templateCells(b, wt), {}, extraId);
        let rec = records.find((r) => r.start === b.start);
        if (!rec) {
          rec = { start: b.start, end: b.end, eve: b.eve, kind: 'weekend', templateId: wt.id, people: {} };
          records.push(rec);
        }
        rec.extraId = extraId;
        for (const d of b.days) {
          const m = masks.get(extraId)!;
          m[idx.get(d)!] |= BIT.S;
        }
      });
    }
  }

  function solveWeekends(wks: DetectedBlock[], t: Template, roles: string[], list: string[]): string[] {
    const R = roles.length;
    const masks = buildMasks();
    const cellsByWR: { i: number; bit: number }[][] = [];
    wks.forEach((b) => {
      const cells = templateCells(b, t);
      roles.forEach((r) => {
        cellsByWR.push(
          cells.filter((c) => c.letter === r && idx.has(c.date)).map((c) => ({ i: idx.get(c.date)!, bit: BIT[c.slot] })),
        );
      });
    });
    const hist = roleHistory(state, month);
    const n = wks.length * R;
    // ยอดเวรต่อคนที่ควรได้ทั้งเดือน (บ่าย+ดึกทุกวัน, OPD+IPD วันหยุด) ใช้กันไม่ให้คนที่มีเวรวันหยุดอยู่แล้วได้ตำแหน่งหนัก
    const monthSet = new Set(monthIdx);
    const totalSlots = mDays.reduce((a, d) => a + (isOffDay(d, holidays) ? 4 : 2), 0);
    const cap = Math.ceil(totalSlots / Math.max(1, active.length));
    const baseCount = (id: string) => monthIdx.reduce((a, i) => a + popcount(masks.get(id)![i] & COUNTED), 0);
    const fixedCount = new Map(list.map((id) => [id, baseCount(id)]));
    const slotsArr = [...list];
    while (slotsArr.length < n) slotsArr.push('');

    const evaluate = (arr: string[]) => {
      let cost = 0;
      const extra = new Map<string, { i: number; bit: number }[]>();
      const where = new Map<string, number[]>();
      arr.forEach((id, k) => {
        if (!id) return;
        const w = Math.floor(k / R);
        const role = roles[k % R];
        const ws = where.get(id) ?? [];
        if (ws.includes(w)) cost += 100_000;
        for (const o of ws) if (Math.abs(o - w) === 1) cost += 60;
        ws.push(w);
        where.set(id, ws);
        extra.set(id, [...(extra.get(id) ?? []), ...cellsByWR[k]]);
        const h = hist[id] ?? [];
        if (h[0] === role) cost += 30;
        if (role === 'C' && h[0] === 'C') cost += 40;
        cost += 6 * h.slice(0, 6).filter((x) => x === role).length;
      });
      for (const [id, e] of extra) {
        cost += costWith(id, masks.get(id)!, e);
        const load = fixedCount.get(id)! + e.filter((c) => monthSet.has(c.i)).reduce((a, c) => a + popcount(c.bit & COUNTED), 0);
        if (load > cap) cost += 500 * (load - cap) ** 2;
      }
      return cost;
    };

    let best = slotsArr;
    let bestCost = Infinity;
    for (let restart = 0; restart < 40; restart++) {
      let cur = shuffle(rng, slotsArr);
      let curCost = evaluate(cur);
      let improved = true;
      while (improved) {
        improved = false;
        for (let a = 0; a < n; a++) {
          for (let b = a + 1; b < n; b++) {
            if (cur[a] === cur[b]) continue;
            const next = [...cur];
            [next[a], next[b]] = [next[b], next[a]];
            const c = evaluate(next);
            if (c < curCost) {
              cur = next;
              curCost = c;
              improved = true;
            }
          }
        }
      }
      if (curCost < bestCost) {
        bestCost = curCost;
        best = cur;
      }
    }
    return best;
  }

  // ขั้นที่จัดแล้วหลังรอบนี้
  const invalidated: Stage[] = mode === 'holiday' ? ['weekend', 'rest'] : mode === 'weekend' ? ['rest'] : [];
  const doneStages = STAGE_ORDER.filter(
    (st) => runs.includes(st) || (mode !== 'all' && oldStages.includes(st) && !invalidated.includes(st)),
  );

  // ---- 4. วันธรรมดา: บ่าย/ดึก เฉลี่ยยอดด้วย simulated annealing ----
  const doRest = runs.includes('rest');
  if (doRest) stage = 'rest';
  if (doRest && !(doneStages.includes('weekend') && doneStages.includes('holiday'))) {
    warn('ยังไม่ได้จัดวันหยุดราชการ/เสาร์–อาทิตย์ — ยอดเวรจะยังไม่สมบูรณ์');
  }
  if (doRest) {
    const masks = buildMasks();
    for (const d of mDays) {
      if (isOffDay(d, holidays) && doneStages.includes('weekend') && doneStages.includes('holiday')) {
        for (const s of ['O', 'I', 'PM', 'N'] as const) {
          if (!days[d]?.[s]) warn(`${thaiDateLabel(d)} ช่อง ${s} ยังไม่มีคน`);
        }
      }
    }
    const free: { i: number; date: string; slot: 'PM' | 'N'; bit: number }[] = [];
    for (const d of mDays) {
      if (isOffDay(d, holidays)) continue;
      for (const s of ['PM', 'N'] as const) if (!days[d]?.[s]) free.push({ i: idx.get(d)!, date: d, slot: s, bit: BIT[s] });
    }
    let fixedTotal = 0;
    for (const id of allIds) {
      const m = masks.get(id)!;
      for (const i of monthIdx) fixedTotal += popcount(m[i] & COUNTED);
    }
    const A = active.length;
    const T = fixedTotal + free.length;
    const totalPlus = new Set(takeFromQueue(q.totalExtra, T % A, [isActive]));
    const NT = mDays.length;
    const nightPlus = new Set(takeFromQueue(q.nightExtra, NT % A, [isActive]));
    totalPlusIds = [...totalPlus];
    nightPlusIds = [...nightPlus];
    const target = activeIds.map((id) => Math.floor(T / A) + (totalPlus.has(id) ? 1 : 0));
    const nTarget = activeIds.map((id) => Math.floor(NT / A) + (nightPlus.has(id) ? 1 : 0));
    note(
      `เวรรวม ${T} เวร: คนละ ${Math.floor(T / A)}` +
        (totalPlus.size ? ` (+1: ${[...totalPlus].map(nameOf).join(', ')})` : ''),
    );
    note(
      `ดึก ${NT} เวร: คนละ ${Math.floor(NT / A)}` + (nightPlus.size ? ` (+1: ${[...nightPlus].map(nameOf).join(', ')})` : ''),
    );

    const pm = activeIds.map((id) => [...masks.get(id)!]);
    const pctx = activeIds.map((id) => ctx.get(id)!);
    const pcost = (p: number) => {
      const m = pm[p];
      let tot = 0;
      let nights = 0;
      for (const i of monthIdx) {
        tot += popcount(m[i] & COUNTED);
        if (m[i] & BIT.N) nights++;
      }
      const dt = tot - target[p];
      const dn = nights - nTarget[p];
      return maskCost(m, pctx[p]) + 1000 * dt * dt + 500 * dn * dn;
    };

    const iters = opts.iterations ?? 60_000;
    let bestAssign: number[] = [];
    let bestTotal = Infinity;
    const initial = pm.map((m) => [...m]);
    for (let restart = 0; restart < 3 && free.length && A; restart++) {
      for (let p = 0; p < A; p++) pm[p] = [...initial[p]];
      const assign = new Array<number>(free.length).fill(-1);
      // greedy เริ่มต้น
      for (const f of shuffle(rng, free.map((_, k) => k))) {
        let bp = 0;
        let bc = Infinity;
        for (let p = 0; p < A; p++) {
          const before = pcost(p);
          pm[p][free[f].i] |= free[f].bit;
          const c = pcost(p) - before + rng() * 5;
          pm[p][free[f].i] &= ~free[f].bit;
          if (c < bc) {
            bc = c;
            bp = p;
          }
        }
        assign[f] = bp;
        pm[bp][free[f].i] |= free[f].bit;
      }
      const costs = pm.map((_, p) => pcost(p));
      let total = costs.reduce((a, b) => a + b, 0);
      const T0 = 400;
      const T1 = 0.5;
      for (let it = 0; it < iters; it++) {
        const temp = T0 * Math.pow(T1 / T0, it / iters);
        if (rng() < 0.6 || free.length < 2) {
          const f = randInt(rng, free.length);
          const p1 = assign[f];
          const p2 = randInt(rng, A);
          if (p2 === p1) continue;
          const { i, bit } = free[f];
          pm[p1][i] &= ~bit;
          pm[p2][i] |= bit;
          const c1 = pcost(p1);
          const c2 = pcost(p2);
          const delta = c1 + c2 - costs[p1] - costs[p2];
          if (delta <= 0 || rng() < Math.exp(-delta / temp)) {
            costs[p1] = c1;
            costs[p2] = c2;
            total += delta;
            assign[f] = p2;
          } else {
            pm[p2][i] &= ~bit;
            pm[p1][i] |= bit;
          }
        } else {
          const f1 = randInt(rng, free.length);
          const f2 = randInt(rng, free.length);
          const p1 = assign[f1];
          const p2 = assign[f2];
          if (p1 === p2) continue;
          const a = free[f1];
          const b = free[f2];
          pm[p1][a.i] &= ~a.bit;
          pm[p2][b.i] &= ~b.bit;
          pm[p1][b.i] |= b.bit;
          pm[p2][a.i] |= a.bit;
          const c1 = pcost(p1);
          const c2 = pcost(p2);
          const delta = c1 + c2 - costs[p1] - costs[p2];
          if (delta <= 0 || rng() < Math.exp(-delta / temp)) {
            costs[p1] = c1;
            costs[p2] = c2;
            total += delta;
            assign[f1] = p2;
            assign[f2] = p1;
          } else {
            pm[p1][b.i] &= ~b.bit;
            pm[p2][a.i] &= ~a.bit;
            pm[p1][a.i] |= a.bit;
            pm[p2][b.i] |= b.bit;
          }
        }
      }
      if (total < bestTotal) {
        bestTotal = total;
        bestAssign = [...assign];
      }
    }
    free.forEach((f, k) => {
      const p = bestAssign[k];
      if (p === undefined || p < 0) return;
      days[f.date] = { ...(days[f.date] ?? {}), [f.slot]: activeIds[p] };
    });
  }

  // ---- 5. SMC ตามคิว (ไม่ใช่คนเดียวกับบ่าย/ดึกของวันนั้น) ----
  const smcDays = old?.smcDays ?? defaultSmcDays(month, state.holidays);
  if (doRest) {
    const masks = buildMasks();
    for (const d of smcDays) {
      const i = idx.get(d)!;
      const strict = (id: string) => {
        if (!isActive(id) || isOff(id, d, BIT.SMC)) return false;
        const m = masks.get(id)!;
        return !m[i] && !(m[i - 1] & BIT.N);
      };
      const relaxed = (id: string) => isActive(id) && !isOff(id, d, BIT.SMC) && !(masks.get(id)![i] & (BIT.PM | BIT.N));
      const [id] = takeFromQueue(q.smc, 1, [strict, relaxed]);
      if (!id) {
        warn(`หาคนอยู่ SMC ${thaiDateLabel(d)} ไม่ได้`);
        continue;
      }
      days[d] = { ...(days[d] ?? {}), SMC: id };
      masks.get(id)![i] |= BIT.SMC;
    }
  }

  // ข้อผิดพลาดจากการตรวจทั้งเดือน เก็บแยกไว้ ไม่ปนกับขั้นที่ไม่ได้จัดรอบนี้
  const checks = findIssues(days, state.people, requests, month, state.holidays)
    .filter((i) => i.level === 'error')
    .map((i) => `${thaiDateLabel(i.date)} ${i.message}`);
  const flat = (k: 'info' | 'warnings') => STAGE_ORDER.flatMap((st) => notes[st]?.[k] ?? []);
  for (const st of STAGE_ORDER) if (notes[st]) notes[st]!.warnings = notes[st]!.warnings.filter((w) => !checks.includes(w));

  return {
    days,
    queues: q,
    record: {
      generatedAt: new Date().toISOString(),
      stages: doneStages,
      // วันหยุดมีผลกับขั้นเสาร์–อาทิตย์/วันหยุด จัดขั้นอื่นซ้ำไม่ถือว่าอัปเดตวันหยุดแล้ว
      holidaysUsed: doHoliday || doWeekend || !old ? sig : old.holidaysUsed,
      notes,
      queuesBefore,
      queuesAfter: clone(q),
      blocks: records.sort((a, b) => a.start.localeCompare(b.start)),
      smcDays,
      weekendRoles,
      noWeekend,
      twoWeekend,
      totalPlus: totalPlusIds,
      nightPlus: nightPlusIds,
      info: flat('info'),
      warnings: [...flat('warnings'), ...checks],
    },
  };
}

/** ประวัติตำแหน่ง A/B/C ของเสาร์–อาทิตย์ เรียงจากเดือนล่าสุด */
export function roleHistory(state: AppState, before: string): Record<string, WeekendRole[]> {
  const out: Record<string, WeekendRole[]> = {};
  const months = Object.keys(state.months)
    .filter((m) => m < before)
    .sort()
    .reverse();
  for (const m of months) {
    for (const [id, roles] of Object.entries(state.months[m].weekendRoles ?? {})) {
      (out[id] ??= []).push(...roles);
    }
  }
  return out;
}

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

/**
 * สุ่มจัดหลายรอบแล้วเลือกผลที่ดีที่สุด: ผิดกฎน้อยสุด → ยอดเวรต่างกันน้อยสุด → ข้อควรเลี่ยงน้อยสุด
 */
export function generateBest(
  state: AppState,
  requests: ShiftRequest[],
  month: string,
  tries = 4,
  seed = Date.now(),
  mode: GenerateMode = 'all',
): GenerateResult {
  let best: { r: GenerateResult; score: number } | undefined;
  for (let k = 0; k < tries; k++) {
    const r = generateMonth(state, requests, month, { seed: seed + k * 7919, mode });
    const issues = findIssues(r.days, state.people, requests, month, state.holidays);
    const errors = issues.filter((i) => i.level === 'error').length;
    const warns = issues.length - errors;
    const totals = new Map<string, number>();
    for (const d of daysInMonth(month)) {
      for (const s of ['O', 'I', 'PM', 'N'] as const) {
        const id = r.days[d]?.[s];
        if (id) totals.set(id, (totals.get(id) ?? 0) + 1);
      }
    }
    const vals = state.people.filter((p) => p.active).map((p) => totals.get(p.id) ?? 0);
    const spread = Math.max(...vals) - Math.min(...vals);
    const score = errors * 10_000 + spread * 100 + warns;
    if (!best || score < best.score) best = { r, score };
  }
  return best!.r;
}
