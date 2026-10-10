import { useEffect, useState } from 'react';
import { thaiMonthLabel } from '../engine/dates';
import { normalizeQueues, QUEUE_KEYS } from '../engine/generate';
import { QUEUE_INFO, type Queues } from '../engine/types';
import type { Ctx } from './App';
import { Chip, clone } from './common';
import { queueLastUse } from '../engine/usage';
import { borrowIn, clean, signed, type Balance } from '../engine/borrow';
import { shiftMonth } from '../engine/dates';

export function QueuesView(ctx: Ctx) {
  const { state, commit } = ctx;
  const ids = state.people.map((p) => p.id);
  const [draft, setDraft] = useState<Queues>(() => normalizeQueues(state.queues, ids));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDraft(normalizeQueues(state.queues, state.people.map((p) => p.id)));
    setDirty(false);
  }, [state.queues, state.people]);

  const people = new Map(state.people.map((p) => [p.id, p]));
  const latest = Object.keys(state.months).sort().pop();
  const used = queueLastUse(state);

  const move = (key: keyof Queues, i: number, d: -1 | 1) => {
    const list = [...draft[key]];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setDraft({ ...draft, [key]: list });
    setDirty(true);
  };

  const save = async () => {
    const next = clone(state);
    next.queues = draft;
    if (await commit(next)) setDirty(false);
  };

  return (
    <div>
      <p className="muted">
        คนบนสุด = คิวถัดไป · คนที่ถูกใช้แล้วจะย้ายไปท้ายคิวอัตโนมัติ (วงเล็บบอกว่าใช้ไปเมื่อไหร่) · คนที่ถูกข้าม (เช่น ไม่ว่าง) ยังอยู่หัวคิว
        {latest && <> · สถานะหลังจัด {thaiMonthLabel(latest)}</>}
      </p>
      <div className="queue-grid">
        {QUEUE_KEYS.filter((key) => key !== 'festival').map((key) => (
          <section key={key} className="card">
            <h3>{QUEUE_INFO[key].label}</h3>
            <p className="muted small">{QUEUE_INFO[key].hint}</p>
            <ol className="queue">
              {draft[key].map((id, i) => {
                const p = people.get(id);
                return (
                  <li key={id} className={p?.active ? '' : 'inactive'}>
                    <span className="qn">{i + 1}</span>
                    <Chip person={p} small />
                    {!p?.active && <span className="muted small"> (พัก)</span>}
                    {used[key]?.get(id) && (
                      <span className={'small ' + (used[key]!.get(id)!.month === latest ? 'used-recent' : 'muted')}>
                        ({used[key]!.get(id)!.month === latest ? 'เพิ่งใช้' : 'ใช้ล่าสุด'} {used[key]!.get(id)!.text})
                      </span>
                    )}
                    <span className="spacer" />
                    <button className="btn-ghost" onClick={() => move(key, i, -1)} aria-label="ขึ้น">
                      ▲
                    </button>
                    <button className="btn-ghost" onClick={() => move(key, i, 1)} aria-label="ลง">
                      ▼
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      <BorrowSection {...ctx} />
      {dirty && (
        <div className="savebar">
          <button className="btn-primary" onClick={save}>
            บันทึกคิว
          </button>
        </div>
      )}
    </div>
  );
}

/** ยอดยืมเวรยกมาต้นเดือน (แก้เองได้ เช่น ยอดจากสมุดเดิม) */
function BorrowSection({ state, commit, month }: Ctx) {
  const manual = state.borrowStart?.[month];
  const { [month]: _, ...others } = state.borrowStart ?? {};
  const computed = borrowIn({ ...state, borrowStart: others }, month);
  const [draft, setDraft] = useState<Balance>(() => borrowIn(state, month));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setDraft(borrowIn(state, month));
    setDirty(false);
  }, [state, month]);
  const bump = (id: string, d: number) => {
    setDraft({ ...draft, [id]: (draft[id] ?? 0) + d });
    setDirty(true);
  };
  const sum = Object.values(draft).reduce((a, b) => a + b, 0);

  const save = async (value: Balance | null) => {
    const next = clone(state);
    const all = { ...(next.borrowStart ?? {}) };
    if (value) all[month] = clean(value);
    else delete all[month];
    next.borrowStart = all;
    if (await commit(next)) setDirty(false);
  };

  return (
    <section className="card">
      <h3>ยืมเวรยกมา — {thaiMonthLabel(month)}</h3>
      <p className="muted small">
        +1 = ยืมเขามา (เดือนนี้อยู่น้อยลง 1) · −1 = ให้ยืม (เดือนนี้อยู่เพิ่ม 1) · ปกติระบบคำนวณจากเดือน{' '}
        {thaiMonthLabel(shiftMonth(month, -1))} ให้เอง แก้ได้ถ้ามียอดจากสมุดเดิม · มีผลเมื่อกดจัดเวรเดือนนี้
        {manual ? ' · ตอนนี้ใช้ยอดที่กรอกเอง' : ''}
      </p>
      <ul className="borrow-list">
        {state.people
          .filter((p) => p.active || draft[p.id])
          .map((p) => (
            <li key={p.id}>
              <Chip person={p} small />
              <span className="spacer" />
              <button className="btn-ghost" onClick={() => bump(p.id, -1)} aria-label="ลด">
                −
              </button>
              <span className={'borrow-val ' + ((draft[p.id] ?? 0) > 0 ? 'borrow-plus' : (draft[p.id] ?? 0) < 0 ? 'borrow-minus' : 'muted')}>
                {draft[p.id] ? signed(draft[p.id]) : '0'}
              </span>
              <button className="btn-ghost" onClick={() => bump(p.id, 1)} aria-label="เพิ่ม">
                +
              </button>
            </li>
          ))}
      </ul>
      {sum !== 0 && <p className="small req-off">ยอดรวมควรเป็น 0 (ยืมเท่ากับให้ยืม) ตอนนี้ {signed(sum)}</p>}
      <div className="row wrap">
        {dirty && (
          <button className="btn-primary" onClick={() => save(draft)}>
            บันทึกยอดยกมา
          </button>
        )}
        {manual && (
          <button className="btn" onClick={() => save(null)}>
            ใช้ยอดที่ระบบคำนวณ ({Object.keys(computed).length ? 'มียอดค้าง' : 'ไม่มียอดค้าง'})
          </button>
        )}
      </div>
    </section>
  );
}
