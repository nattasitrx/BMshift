import { describe, expect, it } from 'vitest';
import { ackStatus, callMessage, daysLeft, lineShareUrl } from '../src/engine/notify';
import { seedState } from '../src/engine/seed';
import type { RequestAck } from '../src/engine/types';

describe('LINE notify / acks', () => {
  const s = seedState();
  const [a, b] = s.people.filter((p) => p.active);
  const acks: RequestAck[] = [
    { month: '2026-12', personId: a.id, kind: 'done', at: '' },
    { month: '2026-12', personId: b.id, kind: 'none', at: '' },
  ];

  it('splits people into done / none / pending', () => {
    const st = ackStatus(s, acks);
    expect(st.done).toEqual([a.id]);
    expect(st.none).toEqual([b.id]);
    expect(st.pending.length).toBe(s.people.filter((p) => p.active).length - 2);
    expect(st.pending).not.toContain(a.id);
  });

  it('counts days to the deadline', () => {
    expect(daysLeft('2026-11-10', '2026-11-08')).toBe(2);
    expect(daysLeft('2026-11-10', '2026-11-12')).toBe(-2);
  });

  it('builds announce and reminder messages', () => {
    const st = { ...s, calls: { '2026-12': { due: '2026-11-10', by: a.name, setAt: '' } } };
    const open = callMessage(st, '2026-12', acks, [], 'https://x/?tab=requests', 'open');
    expect(open).toContain('ธันวาคม 2569');
    expect(open).toContain('10 พ.ย. 69');
    expect(open).toContain('https://x/?tab=requests');
    expect(open).toContain(`— ${a.name}`);
    const pendingPerson = s.people.find((p) => p.active && p.id !== a.id && p.id !== b.id)!;
    const remind = callMessage(st, '2026-12', acks, [{ id: 'r', date: '2026-12-03', personId: pendingPerson.id, type: 'off', createdAt: '' }], 'L', 'remind');
    expect(remind).toContain(`${pendingPerson.name} (ลงแล้ว รอติ๊ก)`);
    expect(remind).not.toContain(`${a.name},`);
  });

  it('encodes the LINE share URL', () => {
    expect(lineShareUrl('ก ข\n')).toBe('https://line.me/R/share?text=%E0%B8%81%20%E0%B8%82%0A');
  });
});
