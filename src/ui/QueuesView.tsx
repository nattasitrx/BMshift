import { useEffect, useState } from 'react';
import { thaiMonthLabel } from '../engine/dates';
import { normalizeQueues, QUEUE_KEYS } from '../engine/generate';
import { QUEUE_INFO, type Queues } from '../engine/types';
import type { Ctx } from './App';
import { Chip, clone } from './common';
import { queueLastUse } from '../engine/usage';

export function QueuesView({ state, commit }: Ctx) {
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
