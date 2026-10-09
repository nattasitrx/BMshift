import { describe, expect, it } from 'vitest';
import { detectBlocks, templateLetters } from '../src/engine/blocks';
import { daysInMonth, isWeekend, shiftMonth, thaiDateLabel, weekday } from '../src/engine/dates';
import { arrangeFestival, listFestivalBlocks, removeFestival, setFestivalPerson } from '../src/engine/festival';
import { clearMonth, defaultSmcDays, generateBest, generateMonth, takeFromQueue } from '../src/engine/generate';
import { undoMonth, withHistory } from '../src/engine/history';
import { changedMonths, describeChange, holidayChange } from '../src/engine/holidayCheck';
import { firstNameOnly, printName } from '../src/engine/names';
import { rateFor, slipFor } from '../src/engine/pay';
import { personHistory, queueLastUse, weekendRoleLabel, weekendRoleLoad } from '../src/engine/usage';
import { nextBaseline, swapBalances, swapPairs, swapsOf, syncBaselines, withBaselines } from '../src/engine/swaps';
import { seedState, SEED_HOLIDAYS, SEED_TEMPLATES } from '../src/engine/seed';
import { findIssues, summarizeMonth } from '../src/engine/summary';
import { SLOTS, type AppState, type GenerateMode, type ShiftRequest } from '../src/engine/types';

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

  it('uses exactly the people chosen for each festival', () => {
    let s = seedState();
    const ids = s.people.map((p) => p.id);
    // ปีใหม่ 6 คน (ny4-6), สงกรานต์ 8 คน (sk6-8 เมื่อหยุด 13–18 เม.ย.)
    s = {
      ...s,
      festivalGroup: Object.fromEntries(ids.map((id, i) => [id, i < 6 ? 'newyear' : 'songkran'] as const)),
      holidays: [...s.holidays, { date: '2027-04-16', name: 'วันหยุดพิเศษ', festival: 'songkran' as const }],
    };
    s = arrangeAll(s);
    const ny = s.festivals.find((f) => f.kind === 'newyear')!;
    const sk = s.festivals.find((f) => f.kind === 'songkran')!;
    expect(ny.templateId).toBe('ny4-6');
    expect(sk.templateId).toBe('sk6-8');
    expect(new Set(Object.values(ny.people))).toEqual(new Set(ids.slice(0, 6)));
    expect(new Set(Object.values(sk.people))).toEqual(new Set(ids.slice(6)));
  });

  it('refuses when the group size does not match any pattern', () => {
    const s = seedState();
    const ids = s.people.map((p) => p.id);
    const bad = { ...s, festivalGroup: Object.fromEntries(ids.map((id, i) => [id, i < 5 ? 'newyear' : 'songkran'] as const)) };
    const [b] = listFestivalBlocks(bad, '2026-12', 1);
    const r = arrangeFestival(bad, [], b);
    expect('error' in r && r.error).toContain('5 คน');
  });

  it('re-arranging keeps the group; swapping a letter moves its cells; removing clears them', () => {
    const s = seedState();
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
  });
});

describe('จัดทีละขั้น / ล้าง / ย้อนกลับ', () => {
  const run = (s: AppState, mode: GenerateMode, month = '2026-12') => {
    const r = generateBest(s, [], month, 3, 11, mode);
    return { ...s, days: r.days, queues: r.queues, months: { ...s.months, [month]: r.record } };
  };
  const weekendDays = ['2026-12-12', '2026-12-13', '2026-12-19', '2026-12-20', '2026-12-26', '2026-12-27'];

  it('เสริม → เสาร์อาทิตย์ → ที่เหลือ เก็บผลของขั้นก่อนไว้', () => {
    let s = arrangeAll(seedState());
    s = run(s, 'extra');
    const extras = weekendDays.map((d) => s.days[d]?.S);
    expect(extras.every(Boolean)).toBe(true);
    expect(s.months['2026-12'].stages).toEqual(['extra']);
    // ยังไม่มีเวรอื่นในวันเสาร์อาทิตย์
    expect(s.days['2026-12-12'].O).toBeUndefined();

    s = run(s, 'weekend');
    expect(weekendDays.map((d) => s.days[d]?.S)).toEqual(extras);
    for (const b of s.months['2026-12'].blocks.filter((x) => x.kind === 'weekend')) {
      expect(Object.values(b.people)).not.toContain(b.extraId);
    }
    expect(s.days['2026-12-15']?.PM).toBeUndefined(); // วันธรรมดายังว่าง
    expect(s.months['2026-12'].stages).toEqual(['holiday', 'extra', 'weekend']);
    const weekendSnapshot = JSON.stringify(weekendDays.map((d) => s.days[d]));

    s = run(s, 'rest');
    expect(JSON.stringify(weekendDays.map((d) => ({ ...s.days[d], SMC: undefined })))).toEqual(
      JSON.stringify(JSON.parse(weekendSnapshot).map((a: object) => ({ ...a, SMC: undefined }))),
    );
    expect(s.months['2026-12'].stages).toEqual(['holiday', 'extra', 'weekend', 'rest']);
    expect(findIssues(s.days, s.people, [], '2026-12', s.holidays).filter((i) => i.level === 'error')).toEqual([]);
    const totals = summarizeMonth(s, '2026-12').map((r) => r.total);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
    // ปีใหม่ยังอยู่ครบ รวมคืนก่อนวันหยุด
    const ny = s.festivals.find((f) => f.kind === 'newyear')!;
    expect(s.days[ny.eve].PM).toBe(ny.people.A);
  });

  it('จัดวันหยุดราชการก่อน แล้วเสาร์–อาทิตย์/วันธรรมดาเก็บไว้และหักยอดให้', () => {
    let s = arrangeAll(seedState());
    s = run(s, 'holiday');
    const rec = s.months['2026-12'];
    expect(rec.stages).toEqual(['holiday']);
    const adj = rec.blocks.find((b) => b.kind === 'adjacent')!;
    const mid = rec.blocks.find((b) => b.kind === 'midweek')!;
    expect(adj && mid).toBeTruthy();
    expect(s.days['2026-12-05'].O).toBeTruthy(); // ช่วงหยุด 5–7 ธ.ค. จัดแล้ว
    expect(s.days['2026-12-12']?.O).toBeUndefined(); // เสาร์–อาทิตย์ปกติยังไม่จัด
    expect(s.days['2026-12-15']?.PM).toBeUndefined(); // วันธรรมดายังไม่จัด
    const holidayCells = ['2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07', '2026-12-09', '2026-12-10'].map((d) =>
      JSON.stringify(SLOTS.map((x) => s.days[d]?.[x] ?? '')),
    );

    s = run(s, 'weekend');
    expect(s.months['2026-12'].stages).toEqual(['holiday', 'extra', 'weekend']);
    const after = ['2026-12-04', '2026-12-05', '2026-12-06', '2026-12-07', '2026-12-09', '2026-12-10'].map((d) =>
      JSON.stringify(SLOTS.map((x) => s.days[d]?.[x] ?? '')),
    );
    expect(after).toEqual(holidayCells); // วันหยุดราชการไม่ถูกสุ่มใหม่
    for (const id of Object.values(adj.people)) expect(s.months['2026-12'].weekendRoles[id]).toBeUndefined();

    s = run(s, 'rest');
    expect(s.months['2026-12'].stages).toEqual(['holiday', 'extra', 'weekend', 'rest']);
    expect(findIssues(s.days, s.people, [], '2026-12', s.holidays).filter((i) => i.level === 'error')).toEqual([]);
    const totals = summarizeMonth(s, '2026-12').map((r) => r.total);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);

    // จัดวันหยุดราชการใหม่ = ล้างเสาร์–อาทิตย์และวันธรรมดา แต่เก็บเวรเสริม
    const extras = s.months['2026-12'].blocks.filter((b) => b.kind === 'weekend').map((b) => b.extraId);
    s = run(s, 'holiday');
    expect(s.months['2026-12'].stages).toEqual(['holiday', 'extra']);
    expect(s.days['2026-12-15']?.PM).toBeUndefined();
    expect(weekendDays.map((d) => s.days[d]?.S)).toEqual(
      weekendDays.map((d) => extras[['12', '13'].includes(d.slice(8)) ? 0 : ['19', '20'].includes(d.slice(8)) ? 1 : 2]),
    );
  });

  it('จัดเฉพาะเสริมหลังจัดครบแล้ว เปลี่ยนแค่ช่องเสริม', () => {
    let s = run(arrangeAll(seedState()), 'all');
    const before = s.days;
    s = run(s, 'extra');
    for (const d of daysInMonth('2026-12')) {
      expect({ ...s.days[d], S: undefined }).toEqual({ ...before[d], S: undefined });
    }
  });

  it('ล้างเดือนคืนคิวและเวรทั้งหมด แต่เก็บปีใหม่และวันที่ของเดือนก่อน', () => {
    const base = arrangeAll(seedState());
    const s = run(base, 'all');
    const c = clearMonth(s, '2026-12');
    expect(c.months['2026-12']).toBeUndefined();
    expect(c.queues).toEqual(base.queues);
    expect(c.days['2026-12-15']).toBeUndefined();
    expect(c.days['2026-12-31'].O).toBe(base.days['2026-12-31'].O);
  });

  it('ย้อนกลับคืนสภาพก่อนการกดครั้งล่าสุด และบันทึกว่าใครทำ', () => {
    const base = arrangeAll(seedState());
    const s = withHistory(base, run(base, 'all'), '2026-12', 'หล้า', 'จัดทั้งหมด');
    expect(s.monthLog!['2026-12']).toMatchObject([{ by: 'หล้า', action: 'จัดทั้งหมด' }]);
    const u = undoMonth(s, '2026-12', 'ปู');
    expect(u.days).toEqual(base.days);
    expect(u.months).toEqual(base.months);
    expect(u.queues).toEqual(base.queues);
    expect(u.undo?.['2026-12']).toBeUndefined();
    expect(u.monthLog!['2026-12'].map((e) => e.by)).toEqual(['หล้า', 'ปู']);
  });
});

describe('เตือนเมื่อวันหยุดเปลี่ยนหลังจัดเวร', () => {
  const gen = (s: AppState, mode: 'all' | 'rest' | 'weekend') => {
    const r = generateMonth(s, [], '2026-12', { seed: 1, iterations: 5_000, mode });
    return { ...s, days: r.days, queues: r.queues, months: { ...s.months, '2026-12': r.record } };
  };

  it('ไม่เตือนถ้าวันหยุดไม่เปลี่ยน และไม่เตือนข้อมูลเก่าที่ไม่ได้บันทึกไว้', () => {
    const s = gen(seedState(), 'all');
    expect(holidayChange(s, '2026-12')).toBeNull();
    expect(holidayChange(s, '2026-11')).toBeNull();
  });

  it('เตือนเมื่อเพิ่ม/ลบวันหยุด และหายเมื่อจัดเสาร์–อาทิตย์ใหม่ (จัดแค่วันธรรมดาไม่พอ)', () => {
    let s = gen(seedState(), 'all');
    s = {
      ...s,
      holidays: [
        ...s.holidays.filter((h) => h.date !== '2026-12-10'),
        { date: '2026-12-11', name: 'วันหยุดพิเศษ' },
      ],
    };
    expect(holidayChange(s, '2026-12')).toEqual({ month: '2026-12', added: ['2026-12-11'], removed: ['2026-12-10'] });
    expect(changedMonths(s).map((c) => c.month)).toEqual(['2026-12']);
    expect(describeChange(s, holidayChange(s, '2026-12')!)).toContain('วันหยุดพิเศษ');

    s = gen(s, 'rest');
    expect(holidayChange(s, '2026-12')).not.toBeNull();
    s = gen(s, 'weekend');
    expect(holidayChange(s, '2026-12')).toBeNull();
    // 10–13 ธ.ค. กลายเป็นหยุดติดกัน (ศุกร์ 11 – อาทิตย์ 13)
    expect(s.months['2026-12'].blocks.some((b) => b.kind === 'adjacent' && b.start === '2026-12-11')).toBe(true);
  });

  it('วันหยุดของเดือนถัดไปที่คร่อมมา (ปีใหม่) ก็นับว่ากระทบ', () => {
    let s = gen(seedState(), 'all');
    s = { ...s, holidays: [...s.holidays, { date: '2027-01-04', name: 'หยุดพิเศษปีใหม่', festival: 'newyear' as const }] };
    expect(holidayChange(s, '2026-12')?.added).toEqual(['2027-01-04:newyear']);
  });
});

describe('ชื่อตอนพิมพ์', () => {
  it('เอาเฉพาะชื่อจริง ตัดคำนำหน้าและนามสกุล', () => {
    expect(firstNameOnly('ภญ.สุภาวดี ศรีสวัสดิ์วงศ์')).toBe('สุภาวดี');
    expect(firstNameOnly('ภก. ธนพล เจริญสุขสันต์')).toBe('ธนพล');
    expect(firstNameOnly('เภสัชกรหญิงกนกวรรณ ทองประเสริฐ')).toBe('กนกวรรณ');
    expect(firstNameOnly('นางสาว ปิยะนุช')).toBe('ปิยะนุช');
    expect(firstNameOnly('  ปิยะนุช  ')).toBe('ปิยะนุช');
    expect(printName({ name: 'มด', fullName: '' })).toBe('มด');
    expect(printName({ name: 'มด' })).toBe('มด');
  });
});

describe('แจ้งวันแยกตามเวร', () => {
  const run = (reqs: ShiftRequest[], seed = 1) => {
    const s = arrangeAll(seedState());
    const r = generateMonth(s, reqs, '2026-12', { seed, iterations: 30_000 });
    return { ...s, days: r.days };
  };
  const req = (date: string, personId: string, type: 'off' | 'want', slot?: ShiftRequest['slot']): ShiftRequest => ({
    id: `${date}${personId}${type}${slot}`, date, personId, type, slot, createdAt: '',
  });

  it('ไม่ว่างดึก: ไม่ได้ดึก แต่ยังได้บ่ายได้', () => {
    const days = daysInMonth('2026-12').slice(0, 20);
    const s = run(days.map((d) => req(d, 'eve', 'off', 'N')));
    for (const d of days) expect(s.days[d]?.N, d).not.toBe('eve');
    expect(days.some((d) => s.days[d]?.PM === 'eve' || s.days[d]?.O === 'eve' || s.days[d]?.I === 'eve')).toBe(true);
  });

  it('ไม่ว่างบ่าย ห้าม SMC ด้วย (คนหัวคิว SMC ถูกข้าม)', () => {
    const first = run([]).days['2026-12-02'].SMC!;
    const s = run([req('2026-12-02', first, 'off', 'PM')]);
    expect(s.days['2026-12-02'].SMC).toBeTruthy();
    expect(s.days['2026-12-02'].SMC).not.toBe(first);
  });

  it('ขออยู่ดึก ได้ดึกวันนั้น และขออยู่บ่ายได้บ่าย', () => {
    const s = run([req('2026-12-16', 'saeng', 'want', 'N'), req('2026-12-22', 'ae', 'want', 'PM')]);
    expect(s.days['2026-12-16'].N).toBe('saeng');
    expect(s.days['2026-12-22'].PM).toBe('ae');
  });

  it('ตรวจพบเมื่อแก้มือไปชนเวรที่แจ้งไม่ว่าง', () => {
    const days = { '2026-12-15': { PM: 'mod', N: 'pu' } };
    const issues = findIssues(days, seedState().people, [req('2026-12-15', 'mod', 'off', 'N'), req('2026-12-15', 'pu', 'off', 'N')], '2026-12');
    expect(issues.map((i) => i.personId)).toEqual(['pu']);
  });
});

describe('ใบเวรน้อย / ค่าเวร', () => {
  it('นับเวรของเดือน × ค่าเวร (เสริมนับ SMC ไม่นับ เป็นค่าเริ่มต้น)', () => {
    const s = seedState();
    // พ.ย. 69: ปู = 1 OPD+บ่าย, 7 เสริม+ดึก, 20 ดึก, 22 OPD+บ่าย, 26 ดึก
    const slip = slipFor(s, '2026-11', 'pu');
    expect(slip.rows.map((r) => r.date.slice(8))).toEqual(['01', '07', '20', '22', '26']);
    expect(slip.count).toBe(8);
    expect(slip.rate).toBe(820);
    expect(slip.total).toBe(6560);
    // อีฟมี SMC วันที่ 2 — ไม่นับเงินแต่แสดงในใบ
    const eve = slipFor(s, '2026-11', 'eve');
    expect(eve.rows.find((r) => r.date === '2026-11-02')).toMatchObject({ slots: ['SMC'], count: 0 });
    const withSmc = slipFor({ ...s, settings: { ...s.settings, payCountSmc: true } }, '2026-11', 'eve');
    expect(withSmc.count).toBe(eve.count + 1);
  });

  it('ค่าเวรเปลี่ยนตามเดือนที่เริ่มใช้', () => {
    const s = seedState();
    const t = { ...s, settings: { ...s.settings, payRates: [{ from: '2000-01', amount: 820 }, { from: '2027-01', amount: 900 }] } };
    expect(rateFor(t, '2026-12')).toBe(820);
    expect(rateFor(t, '2027-01')).toBe(900);
    expect(rateFor(t, '2027-06')).toBe(900);
  });
});

describe('วันที่ภาษาไทย', () => {
  it('ใช้ตัวย่อเดือนมาตรฐาน', () => {
    expect(thaiDateLabel('2026-11-03')).toBe('อ 3 พ.ย. 69');
    expect(thaiDateLabel('2027-01-01')).toBe('ศ 1 ม.ค. 70');
    expect(thaiDateLabel('2026-12-31')).toBe('พฤ 31 ธ.ค. 69');
  });
});

describe('ชื่อแพทเทิร์นและประวัติการใช้คิว', () => {
  it('A/B/C เป็นชื่อเวรจริง', () => {
    const s = seedState();
    expect(weekendRoleLabel(s, 'A')).toBe('บ่าย-เช้าดึก');
    expect(weekendRoleLabel(s, 'B')).toBe('ดึก-เช้าบ่าย');
    expect(weekendRoleLabel(s, 'C')).toBe('เช้าบ่าย-เช้าดึก');
    expect(weekendRoleLabel(s, 'A', 'long')).toBe('ศ บ่าย · ส เช้า+ดึก');
    expect(weekendRoleLoad(s, 'C')).toBe(4);
  });

  it('ประวัติรายคนบอกว่าอยู่อะไร เดือนไหน', () => {
    const s = seedState();
    const h = personHistory(s, 'pu', ['2026-10', '2026-11']);
    expect(h.map((e) => e.text)).toEqual([
      'ส-อา ส 31 ต.ค. 69 – อา 1 พ.ย. 69: ศ ดึก · อา เช้า+บ่าย',
      'เวรเสริม ส 7 พ.ย. 69 – อา 8 พ.ย. 69',
      'ส-อา ส 21 พ.ย. 69 – อา 22 พ.ย. 69: ศ ดึก · อา เช้า+บ่าย',
    ]);
  });

  it('คิวบอกว่าใครถูกใช้ล่าสุดเมื่อไหร่', () => {
    const s = seedState();
    const r = generateMonth(arrangeAll(s), [], '2026-12', { seed: 2, iterations: 5_000 });
    const t = { ...s, days: r.days, months: { ...s.months, '2026-12': r.record } };
    const use = queueLastUse(t);
    const adj = r.record.blocks.find((b) => b.kind === 'adjacent')!;
    for (const id of Object.values(adj.people)) expect(use.adjacent?.get(id)?.month).toBe('2026-12');
    expect(use.extra?.get('la')?.month).toBe('2026-11'); // หล้าเสริม 28–29 พ.ย.
    for (const id of r.record.totalPlus ?? []) expect(use.totalExtra?.get(id)?.month).toBe('2026-12');
  });
});

describe('ข้อมูล พ.ย. 69', () => {
  it('มดกับแสงอยู่ในคิวไม่อยู่ ส-อา ของ พ.ย. 69 (ทั้งข้อมูลตั้งต้นและข้อมูลที่บันทึกไว้ก่อน)', async () => {
    const { migrate } = await import('../src/ui/api');
    expect(seedState().months['2026-11'].noWeekend).toEqual(['mod', 'saeng']);
    const old = seedState();
    delete old.months['2026-11'].noWeekend;
    const m = migrate(old);
    expect(m.months['2026-11'].noWeekend).toEqual(['mod', 'saeng']);
    expect(queueLastUse(m).noWeekend?.get('mod')?.month).toBe('2026-11');
    expect(personHistory(m, 'saeng', ['2026-11']).map((e) => e.text)).toEqual(['ไม่อยู่ ส-อา พฤศจิกายน 2569']);
  });
});

describe('ฝาก/ยืมเวร', () => {
  const gen = (s: AppState, mode: GenerateMode): AppState => {
    const r = generateMonth(s, [], '2026-12', { seed: 4, iterations: 10_000, mode });
    return {
      ...s,
      days: r.days,
      months: { ...s.months, '2026-12': { ...r.record, baseline: nextBaseline('2026-12', s.days, r.days, s.months['2026-12'], mode === 'all') } },
    };
  };
  const edit = (s: AppState, date: string, slot: 'PM' | 'N', id: string): AppState => ({
    ...s,
    days: { ...s.days, [date]: { ...s.days[date], [slot]: id } },
  });

  it('แก้ช่องหลังจัด = เจ้าของเดิมฝากให้คนที่อยู่จริง', () => {
    let s = gen(arrangeAll(seedState()), 'all');
    const owner = s.days['2026-12-15'].PM!;
    const other = s.people.find((p) => p.id !== owner && p.active)!.id;
    s = edit(s, '2026-12-15', 'PM', other);
    expect(swapsOf(s, ['2026-12'])).toEqual([{ date: '2026-12-15', slot: 'PM', from: owner, to: other }]);
    const bal = swapBalances(swapsOf(s, ['2026-12']));
    expect(bal.find((b) => b.id === owner)).toMatchObject({ gave: 1, took: 0 });
    expect(bal.find((b) => b.id === other)).toMatchObject({ gave: 0, took: 1 });
    // แก้กลับ = ไม่มีค้าง
    s = edit(s, '2026-12-15', 'PM', owner);
    expect(swapsOf(s, ['2026-12'])).toEqual([]);
  });

  it('แลกกันสองเวร หักลบกันเป็นคู่', () => {
    let s = gen(arrangeAll(seedState()), 'all');
    const a = s.days['2026-12-15'].PM!;
    const b = s.days['2026-12-16'].PM!;
    s = edit(edit(s, '2026-12-15', 'PM', b), '2026-12-16', 'PM', a);
    const pairs = swapPairs(swapsOf(s, ['2026-12']));
    expect(pairs).toHaveLength(1);
    expect(pairs[0].aToB).toHaveLength(1);
    expect(pairs[0].bToA).toHaveLength(1);
  });

  it('จัดบางขั้นใหม่ไม่ลบการแลกในส่วนที่ระบบไม่ได้แตะ, จัดเทศกาลใหม่ไม่นับเป็นการฝาก', () => {
    let s = gen(arrangeAll(seedState()), 'all');
    const sat = '2026-12-12';
    const owner = s.days[sat].PM!;
    const other = s.people.find((p) => p.id !== owner && p.active && !Object.values(s.days[sat]).includes(p.id))!.id;
    s = { ...s, days: { ...s.days, [sat]: { ...s.days[sat], PM: other } } };
    s = gen(s, 'rest'); // จัดวันธรรมดาใหม่ ไม่แตะเสาร์
    expect(swapsOf(s, ['2026-12']).filter((x) => x.date === sat)).toEqual([{ date: sat, slot: 'PM', from: owner, to: other }]);

    const [ny] = listFestivalBlocks(s, '2026-12', 1);
    const r = arrangeFestival(s, [], ny, { seed: 99 });
    if (!('state' in r)) throw new Error(r.error);
    const synced = syncBaselines(s, r.state);
    expect(swapsOf(synced, ['2026-12']).filter((x) => x.date >= '2026-12-30')).toEqual([]);
  });

  it('ข้อมูลเก่าที่ยังไม่มีเวรตั้งต้น เริ่มนับจากตอนนี้', () => {
    const s = withBaselines(seedState());
    expect(s.months['2026-11'].baseline?.['2026-11-03']).toEqual({ PM: 'alex', N: 'ae' });
    expect(swapsOf(s, ['2026-11'])).toEqual([]);
  });
});
