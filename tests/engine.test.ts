import { describe, expect, it } from 'vitest';
import { detectBlocks, templateLetters } from '../src/engine/blocks';
import { daysInMonth, isWeekend, shiftMonth, weekday } from '../src/engine/dates';
import { arrangeFestival, listFestivalBlocks, removeFestival, setFestivalPerson } from '../src/engine/festival';
import { defaultSmcDays, generateMonth, takeFromQueue } from '../src/engine/generate';
import { seedState, SEED_HOLIDAYS, SEED_TEMPLATES } from '../src/engine/seed';
import { findIssues, summarizeMonth } from '../src/engine/summary';
import { SLOTS, type AppState, type ShiftRequest } from '../src/engine/types';

function apply(state: AppState, month: string, requests: ShiftRequest[] = [], seed = 1) {
  const r = generateMonth(state, requests, month, { seed, iterations: 30_000 });
  return {
    state: { ...state, days: r.days, queues: r.queues, months: { ...state.months, [month]: r.record } },
    record: r.record,
  };
}

/** จัดปีใหม่/สงกรานต์ทั้งหมดในช่วงล่วงหน้า (เหมือนกดในแท็บเทศกาล) */
function arrangeAll(state: AppState, from = '2026-12', months = 14): AppState {
  for (const b of listFestivalBlocks(state, from, months)) {
    const r = arrangeFestival(state, [], b, { seed: 3 });
    if ('state' in r) state = r.state;
  }
  return state;
}

describe('dates & seed data', () => {
  it('Nov 1 2026 is Sunday, Dec 5 2026 is Saturday', () => {
    expect(weekday('2026-11-01')).toBe(0);
    expect(weekday('2026-12-05')).toBe(6);
  });

  it('substitution holidays fall on Monday', () => {
    for (const h of SEED_HOLIDAYS.filter((x) => x.name.startsWith('ชดเชย'))) expect(weekday(h.date)).toBe(1);
  });

  it('every template obeys the hard rules on its own', () => {
    for (const t of SEED_TEMPLATES) {
      const days: AppState['days'] = {};
      const dates = Array.from({ length: t.rows.length }, (_, i) => `2030-01-${String(10 + i).padStart(2, '0')}`);
      t.rows.forEach((row, r) =>
        row.forEach((l, c) => {
          if (l) days[dates[r]] = { ...(days[dates[r]] ?? {}), [SLOTS[c]]: l === '*' ? 'X' : l };
        }),
      );
      const people = [...templateLetters(t), 'X'].map((id) => ({ id, name: id, color: '', canDouble: false, active: true }));
      const errors = findIssues(days, people, [], '2030-01').filter((i) => i.level === 'error');
      expect(errors, t.id).toEqual([]);
    }
  });
});

describe('takeFromQueue', () => {
  it('moves picked people to the end and keeps skipped ones at the front', () => {
    const q = ['a', 'b', 'c', 'd'];
    expect(takeFromQueue(q, 1, [(id) => id !== 'a'])).toEqual(['b']);
    expect(q).toEqual(['a', 'c', 'd', 'b']);
  });
});

describe('block detection', () => {
  it('reads November 2569 as four normal weekends', () => {
    const b = detectBlocks('2026-11', SEED_HOLIDAYS);
    expect(b.map((x) => [x.start, x.kind])).toEqual([
      ['2026-11-07', 'weekend'],
      ['2026-11-14', 'weekend'],
      ['2026-11-21', 'weekend'],
      ['2026-11-28', 'weekend'],
    ]);
  });

  it('reads December 2569 holidays', () => {
    const b = detectBlocks('2026-12', SEED_HOLIDAYS);
    expect(b.map((x) => [x.start, x.end, x.kind])).toEqual([
      ['2026-12-05', '2026-12-07', 'adjacent'],
      ['2026-12-10', '2026-12-10', 'midweek'],
      ['2026-12-12', '2026-12-13', 'weekend'],
      ['2026-12-19', '2026-12-20', 'weekend'],
      ['2026-12-26', '2026-12-27', 'weekend'],
      ['2026-12-31', '2027-01-03', 'newyear'],
    ]);
  });

  it('SMC defaults to 1st/3rd Monday and every Wednesday', () => {
    expect(defaultSmcDays('2026-11', SEED_HOLIDAYS)).toEqual([
      '2026-11-02', '2026-11-04', '2026-11-11', '2026-11-16', '2026-11-18', '2026-11-25',
    ]);
  });
});

describe('generateMonth', () => {
  it('regenerating November matches the hand-made structure', () => {
    const { state, record } = apply(seedState(), '2026-11');
    const sum = summarizeMonth(state, '2026-11');
    expect(sum.reduce((a, r) => a + r.total, 0)).toBe(78);
    expect(sum.reduce((a, r) => a + r.night, 0)).toBe(30);
    // ปูมีเวร 1 พ.ย. ติดมาจากเสาร์–อาทิตย์ของ ต.ค. จึงอาจได้ดึกน้อยกว่าคนอื่น 1 เวร
    for (const r of sum) expect(r.night).toBeGreaterThanOrEqual(1);
    expect(Math.max(...sum.map((r) => r.total)) - Math.min(...sum.map((r) => r.total))).toBeLessThanOrEqual(1);
    // Nov 1 belongs to October's weekend and must be kept
    expect(state.days['2026-11-01'].O).toBe('pu');
    // 12 weekend slots for 14 people: two people skip (from the "ไม่อยู่ ส-อา" queue)
    const withWeekend = Object.keys(record.weekendRoles);
    expect(withWeekend).toHaveLength(12);
    expect(record.warnings.filter((w) => !w.includes('ยังไม่มีคน'))).toEqual([]);
  });

  it('nobody repeats last month\'s A/B/C role when avoidable', () => {
    const s = seedState();
    const { record } = apply(s, '2026-12');
    const nov = s.months['2026-11'].weekendRoles;
    let repeats = 0;
    for (const [id, roles] of Object.entries(record.weekendRoles)) if (nov[id]?.[0] === roles[0]) repeats++;
    expect(repeats).toBeLessThanOrEqual(1);
  });

  it('December 2569: holiday queues, exemptions, เสริม and SMC rules', () => {
    const s = arrangeAll(seedState());
    const { state, record } = apply(s, '2026-12');
    const adj = record.blocks.find((b) => b.kind === 'adjacent')!;
    // first 4 eligible from the "หยุดติดกัน" queue
    expect(Object.values(adj.people).sort()).toEqual(['ae', 'alex', 'mouse', 'prae']);
    // those 4 are exempt from normal weekends
    for (const id of Object.values(adj.people)) expect(record.weekendRoles[id]).toBeUndefined();
    // ปีใหม่ที่จัดแยกไว้ ถูกเก็บไว้ตามเดิม (ไม่ถูกสุ่มใหม่)
    const slots = (d: string) => SLOTS.map((x) => state.days[d]?.[x] ?? '');
    for (const d of ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-03']) {
      expect(slots(d)).toEqual(SLOTS.map((x) => s.days[d]?.[x] ?? ''));
    }
    expect(record.info.some((x) => x.startsWith('ปีใหม่'))).toBe(true);
    for (const b of record.blocks.filter((x) => x.kind === 'weekend')) {
      expect(b.extraId).toBeTruthy();
      expect(Object.values(b.people)).not.toContain(b.extraId);
    }
    for (const d of record.smcDays) {
      const a = state.days[d];
      expect(a.SMC).toBeTruthy();
      expect([a.PM, a.N]).not.toContain(a.SMC);
    }
    const totals = summarizeMonth(state, '2026-12').map((r) => r.total);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
    const issues = findIssues(state.days, state.people, [], '2026-12', state.holidays);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
    // บ่าย→ดึก / ดึก→บ่าย วันธรรมดา ควรเลี่ยงได้เกือบหมด
    expect(issues.filter((i) => i.level === 'warn').length).toBeLessThanOrEqual(2);
  });

  it('respects "ไม่ว่าง" requests and tries to honour "ขออยู่"', () => {
    const s = seedState();
    const reqs: ShiftRequest[] = [
      ...daysInMonth('2026-12').slice(0, 15).map((date, k) => ({
        id: `r${k}`, date, personId: 'mod', type: 'off' as const, createdAt: '',
      })),
      { id: 'w1', date: '2026-12-16', personId: 'saeng', type: 'want', createdAt: '' },
    ];
    const { state } = apply(arrangeAll(s), '2026-12', reqs);
    for (const d of daysInMonth('2026-12').slice(0, 15)) {
      expect(Object.values(state.days[d] ?? {})).not.toContain('mod');
    }
    expect(Object.values(state.days['2026-12-16'])).toContain('saeng');
  });

  it('runs a full year without breaking hard rules', () => {
    let state = arrangeAll(seedState());
    let month = '2026-12';
    for (let k = 0; k < 13; k++) {
      ({ state } = apply(state, month, [], k + 7));
      const errors = findIssues(state.days, state.people, [], month, state.holidays).filter((i) => i.level === 'error');
      expect(errors, month).toEqual([]);
      const sum = summarizeMonth(state, month);
      const totals = sum.map((r) => r.total);
      expect(Math.max(...totals) - Math.min(...totals), month).toBeLessThanOrEqual(2);
      // every off day has its morning shifts filled (unless no template exists)
      for (const d of daysInMonth(month)) {
        if (isWeekend(d) && state.months[month].warnings.every((w) => !w.includes('ไม่มีแพทเทิร์น'))) {
          expect(state.days[d]?.O, d).toBeTruthy();
        }
      }
      month = shiftMonth(month, 1);
    }
  });
});

describe('festivals (ปีใหม่/สงกรานต์ จัดแยก)', () => {
  it('month generation warns when the festival is not arranged yet', () => {
    const { state, record } = apply(seedState(), '2026-12');
    expect(record.warnings.some((w) => w.startsWith('ยังไม่ได้จัดปีใหม่'))).toBe(true);
    expect(state.days['2026-12-31']?.O).toBeUndefined();
  });

  it('festival shifts are deducted before balancing the rest of the month', () => {
    let s = arrangeAll(seedState());
    const ny = s.festivals.find((f) => f.kind === 'newyear')!;
    expect(Object.keys(ny.people)).toHaveLength(7);
    ({ state: s } = apply(s, '2026-12'));
    const totals = summarizeMonth(s, '2026-12').map((r) => r.total);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
    // January keeps Jan 1–3 from the festival and balances around it
    const { state: jan } = apply(s, '2027-01');
    for (const d of ['2027-01-01', '2027-01-02', '2027-01-03']) expect(jan.days[d]).toEqual(s.days[d]);
  });

  it('New Year and Songkran together cover everyone', () => {
    let s = seedState();
    s = { ...s, holidays: [...s.holidays, { date: '2027-04-16', name: 'วันหยุดพิเศษ', festival: 'songkran' as const }] };
    s = arrangeAll(s);
    const ny = s.festivals.find((f) => f.kind === 'newyear')!;
    const sk = s.festivals.find((f) => f.kind === 'songkran')!;
    expect(sk).toBeTruthy();
    const all = new Set([...Object.values(ny.people), ...Object.values(sk.people)]);
    expect(all.size).toBe(14);
  });

  it('re-arranging restores the queue first; swapping a letter moves its cells', () => {
    let s = seedState();
    const [b] = listFestivalBlocks(s, '2026-12', 1);
    const r1 = arrangeFestival(s, [], b, { seed: 1 });
    if (!('state' in r1)) throw new Error(r1.error);
    const r2 = arrangeFestival(r1.state, [], b, { seed: 2 });
    if (!('state' in r2)) throw new Error(r2.error);
    expect(new Set(Object.values(r2.festival.people))).toEqual(new Set(Object.values(r1.festival.people)));
    expect(r2.state.festivals).toHaveLength(1);

    const f = r2.state.festivals[0];
    const outsider = s.people.find((p) => !Object.values(f.people).includes(p.id))!.id;
    const moved = setFestivalPerson(r2.state, f, 'A', outsider);
    expect(moved.days[f.eve].PM).toBe(outsider);
    const removed = removeFestival(moved, moved.festivals[0]);
    expect(removed.festivals).toHaveLength(0);
    expect(removed.days['2026-12-31']?.O).toBeUndefined();
    expect(removed.queues.festival).toEqual(s.queues.festival);
  });
});
