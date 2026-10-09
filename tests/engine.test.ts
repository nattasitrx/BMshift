import { describe, expect, it } from 'vitest';
import { detectBlocks, templateLetters } from '../src/engine/blocks';
import { daysInMonth, isWeekend, shiftMonth, weekday } from '../src/engine/dates';
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
    const s = seedState();
    const { state, record } = apply(s, '2026-12');
    const adj = record.blocks.find((b) => b.kind === 'adjacent')!;
    // first 4 eligible from the "หยุดติดกัน" queue
    expect(Object.values(adj.people).sort()).toEqual(['ae', 'alex', 'mouse', 'prae']);
    // those 4 are exempt from normal weekends
    for (const id of Object.values(adj.people)) expect(record.weekendRoles[id]).toBeUndefined();
    // the New Year block spills into January and is stored now
    expect(state.days['2027-01-03']?.O).toBeTruthy();
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
    const { state } = apply(s, '2026-12', reqs);
    for (const d of daysInMonth('2026-12').slice(0, 15)) {
      expect(Object.values(state.days[d] ?? {})).not.toContain('mod');
    }
    expect(Object.values(state.days['2026-12-16'])).toContain('saeng');
  });

  it('runs a full year without breaking hard rules', () => {
    let state = seedState();
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
