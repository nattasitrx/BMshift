import { useCallback, useEffect, useState } from 'react';
import { holidayMap, isOffDay } from '../engine/blocks';
import { daysInMonth, thaiDateLabel, thaiMonthLabel, weekday } from '../engine/dates';
import { REQUEST_SLOT_LABEL, requestLabel } from '../engine/requests';
import type { RequestAck, RequestSlot, ShiftRequest } from '../engine/types';
import { addRequest, deleteRequest, listAcks, newId, setAck } from './api';
import type { Ctx } from './App';
import { CallPanel } from './CallPanel';
import { Chip, getMe, saveMe } from './common';

export function RequestsView(ctx: Ctx) {
  const { state, mode, requests, reloadRequests, month } = ctx;
  const [acks, setAcks] = useState<RequestAck[]>([]);
  const reloadAcks = useCallback(async () => {
    try {
      setAcks(await listAcks(mode, month));
    } catch {
      setAcks([]);
    }
  }, [mode, month]);
  useEffect(() => {
    reloadAcks();
  }, [reloadAcks]);
  const [me, setMeState] = useState(getMe);
  const [kind, setKind] = useState<ShiftRequest['type']>('off');
  const [slot, setSlot] = useState<RequestSlot>('day');
  const slotOf = (r: ShiftRequest) => r.slot ?? 'day';
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
      // เวรเดียวกันในวันเดียวกันมีได้คำขอเดียว: แตะซ้ำ = ยกเลิก, แตะอีกแบบ = เปลี่ยน
      const same = requests.find((r) => r.personId === me && r.date === date && slotOf(r) === slot);
      if (same) await deleteRequest(mode, same);
      if (!same || same.type !== kind) {
        await addRequest(mode, { id: newId(), date, personId: me, type: kind, slot, by: meName });
        // เคยติ๊ก "ไม่มีวันไม่ว่าง" แต่มาลงไม่ว่าง → เปลี่ยนเป็น "ลงข้อมูลแล้ว"
        if (kind === 'off' && acks.some((a) => a.personId === me && a.kind === 'none')) {
          await setAck(mode, month, me, 'done');
          await reloadAcks();
        }
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
        <div className="seg seg-slot">
          {(Object.keys(REQUEST_SLOT_LABEL) as RequestSlot[]).map((k) => (
            <button key={k} className={slot === k ? 'seg-on' : ''} onClick={() => setSlot(k)}>
              {REQUEST_SLOT_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="muted small">
          เลือกชื่อ แล้วแตะวันที่เพื่อแจ้ง "<b>{requestLabel({ type: kind, slot })}</b>" แตะซ้ำเพื่อยกเลิก · วันเดียวแจ้งได้หลายเวร เช่น
          ไม่ว่างดึก + ขออยู่บ่าย · "เช้า" ใช้กับวันหยุด (OPD/IPD/เสริม) · ไม่ว่างบ่ายจะไม่ได้ SMC ด้วย
          {state.months[month] && ' · เดือนนี้จัดเวรแล้ว คำขอใหม่จะมีผลเมื่อกดจัดใหม่'}
        </p>
      </section>

      <CallPanel key={month} ctx={ctx} me={me} acks={acks} reloadAcks={reloadAcks} />

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
          const mine = requests.filter((r) => r.personId === me && r.date === d);
          const others = requests.filter((r) => r.date === d && r.personId !== me).length;
          const tone = mine.some((r) => r.type === 'off') ? (mine.some((r) => r.type === 'want') ? 'mix' : 'off') : 'want';
          return (
            <button
              key={d}
              className={'cal-day' + (isOffDay(d, hol) ? ' off' : '') + (mine.length ? ` mine-${tone}` : '')}
              onClick={() => toggle(d)}
              disabled={!me || busy}
              title={hol.get(d)?.name}
            >
              <span className="num">{Number(d.slice(8))}</span>
              {mine.map((r) => (
                <span key={r.id} className="tag">
                  {requestLabel(r)}
                </span>
              ))}
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
              <span className={r.type === 'off' ? 'req-off' : 'req-want'}>{requestLabel(r)}</span>
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
