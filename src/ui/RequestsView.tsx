import { useState } from 'react';
import { holidayMap, isOffDay } from '../engine/blocks';
import { daysInMonth, thaiDateLabel, thaiMonthLabel, weekday } from '../engine/dates';
import type { ShiftRequest } from '../engine/types';
import { addRequest, deleteRequest, newId } from './api';
import type { Ctx } from './App';
import { Chip, getMe, saveMe } from './common';

export function RequestsView({ state, mode, requests, reloadRequests, month }: Ctx) {
  const [me, setMeState] = useState(getMe);
  const [kind, setKind] = useState<ShiftRequest['type']>('off');
  const [busy, setBusy] = useState(false);
  const people = new Map(state.people.map((p) => [p.id, p]));
  const hol = holidayMap(state.holidays);
  const days = daysInMonth(month);
  const lead = weekday(days[0]);
  const meName = people.get(me)?.name ?? '';

  const setMe = (id: string) => {
    setMeState(id);
    saveMe(id);
  };

  const toggle = async (date: string) => {
    if (!me || busy) return;
    setBusy(true);
    try {
      const mine = requests.find((r) => r.personId === me && r.date === date);
      if (mine) await deleteRequest(mode, mine);
      if (!mine || mine.type !== kind) {
        await addRequest(mode, { id: newId(), date, personId: me, type: kind, by: meName });
      }
      await reloadRequests();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: ShiftRequest) => {
    if (!confirm(`ลบคำขอของ ${people.get(r.personId)?.name} วันที่ ${thaiDateLabel(r.date)}?`)) return;
    await deleteRequest(mode, r);
    await reloadRequests();
  };

  const sorted = [...requests].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <section className="card">
        <label className="field">
          ฉันคือ
          <select value={me} onChange={(e) => setMe(e.target.value)}>
            <option value="">— เลือกชื่อ —</option>
            {state.people
              .filter((p) => p.active)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <div className="seg">
          <button className={kind === 'off' ? 'seg-on off' : ''} onClick={() => setKind('off')}>
            ❌ ไม่ว่าง
          </button>
          <button className={kind === 'want' ? 'seg-on want' : ''} onClick={() => setKind('want')}>
            ✅ ขออยู่
          </button>
        </div>
        <p className="muted small">
          เลือกชื่อ แล้วแตะวันที่เพื่อแจ้ง "{kind === 'off' ? 'ไม่ว่าง' : 'ขออยู่'}" แตะซ้ำเพื่อยกเลิก
          {state.months[month] && ' · เดือนนี้จัดเวรแล้ว คำขอใหม่จะมีผลเมื่อกดจัดใหม่'}
        </p>
      </section>

      <h2 className="cal-title">{thaiMonthLabel(month)}</h2>
      <div className={'cal' + (me ? '' : ' disabled')}>
        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map((d) => (
          <div key={d} className="cal-head">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`x${i}`} />
        ))}
        {days.map((d) => {
          const mine = requests.find((r) => r.personId === me && r.date === d);
          const others = requests.filter((r) => r.date === d && r.personId !== me).length;
          return (
            <button
              key={d}
              className={'cal-day' + (isOffDay(d, hol) ? ' off' : '') + (mine ? ` mine-${mine.type}` : '')}
              onClick={() => toggle(d)}
              disabled={!me || busy}
              title={hol.get(d)?.name}
            >
              <span className="num">{Number(d.slice(8))}</span>
              {mine && <span className="tag">{mine.type === 'off' ? 'ไม่ว่าง' : 'ขออยู่'}</span>}
              {others > 0 && <span className="others">+{others}</span>}
            </button>
          );
        })}
      </div>

      <section className="card">
        <h3>คำขอทั้งหมดเดือนนี้ ({requests.length})</h3>
        {sorted.length === 0 && <p className="muted">ยังไม่มี</p>}
        <ul className="req-list">
          {sorted.map((r) => (
            <li key={r.id}>
              <span className="nowrap">{thaiDateLabel(r.date)}</span>
              <Chip person={people.get(r.personId)} small />
              <span className={r.type === 'off' ? 'req-off' : 'req-want'}>{r.type === 'off' ? 'ไม่ว่าง' : 'ขออยู่'}</span>
              {r.by && r.by !== people.get(r.personId)?.name && <span className="muted small">(โดย {r.by})</span>}
              <button className="btn-ghost" onClick={() => remove(r)} aria-label="ลบ">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
