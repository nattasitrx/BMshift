import { useState } from 'react';
import { daysInMonth, shiftMonth, thaiDateLabel, thaiMonthLabel, toISO } from '../engine/dates';
import { logOnly } from '../engine/history';
import { ACK_LABEL, ackStatus, callMessage, daysLeft, lineShareUrl } from '../engine/notify';
import type { RequestAck } from '../engine/types';
import { setAck } from './api';
import type { Ctx } from './App';
import { Chip } from './common';

/** ลิงก์เปิดแอปที่หน้าแจ้งวันของเดือนนี้ */
export function requestsLink(month: string): string {
  return `${location.origin}/?tab=requests&month=${month}`;
}

/** กำหนดส่งข้อมูล + ติ๊กยืนยัน + ปุ่มแจ้งในกลุ่ม LINE */
export function CallPanel({
  ctx,
  me,
  acks,
  reloadAcks,
}: {
  ctx: Ctx;
  me: string;
  acks: RequestAck[];
  reloadAcks: () => Promise<void>;
}) {
  const { state, mode, commit, requests, month } = ctx;
  const call = state.calls?.[month];
  const people = new Map(state.people.map((p) => [p.id, p]));
  const today = toISO(new Date());
  const [editing, setEditing] = useState(false);
  const [due, setDue] = useState(call?.due ?? `${shiftMonth(month, -1)}-10`);
  const [by, setBy] = useState(call?.by ?? people.get(me)?.name ?? '');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const status = ackStatus(state, acks);
  const total = status.done.length + status.none.length + status.pending.length;
  const myAck = acks.find((a) => a.personId === me)?.kind;
  const myOff = requests.filter((r) => r.personId === me && r.type === 'off').length;
  const withReq = new Set(requests.map((r) => r.personId));

  const saveCall = async () => {
    if (!due || !by) return;
    const next = { ...state, calls: { ...(state.calls ?? {}), [month]: { due, by, setAt: new Date().toISOString() } } };
    if (await commit(logOnly(next, month, by, `ตั้งกำหนดส่งข้อมูล ภายใน ${thaiDateLabel(due)}`))) setEditing(false);
  };

  const removeCall = async () => {
    if (!call || !confirm('ลบกำหนดส่งข้อมูลของเดือนนี้?')) return;
    const calls = { ...(state.calls ?? {}) };
    delete calls[month];
    await commit(logOnly({ ...state, calls }, month, call.by, 'ลบกำหนดส่งข้อมูล'));
    setEditing(false);
  };

  const ack = async (kind: RequestAck['kind']) => {
    if (!me || busy) return;
    if (kind === 'none' && myOff > 0 && myAck !== 'none' &&
      !confirm(`มีคำขอไม่ว่างอยู่ ${myOff} รายการ ยังจะติ๊ก "ไม่มีวันไม่ว่าง" ไหม? (คำขอเดิมยังอยู่)`)) return;
    setBusy(true);
    try {
      await setAck(mode, month, me, myAck === kind ? null : kind);
      await reloadAcks();
    } finally {
      setBusy(false);
    }
  };

  const message = (kind: 'open' | 'remind') => callMessage(state, month, acks, requests, requestsLink(month), kind);
  const share = (kind: 'open' | 'remind') => window.open(lineShareUrl(message(kind)), '_blank', 'noopener');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message(status.pending.length && call ? 'remind' : 'open'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('คัดลอกข้อความนี้', message('open'));
    }
  };

  const left = call ? daysLeft(call.due, today) : 0;
  const leftText = !call ? '' : left > 0 ? `เหลือ ${left} วัน` : left === 0 ? 'วันนี้วันสุดท้าย' : `เลยกำหนด ${-left} วัน`;
  const lastDay = daysInMonth(month).at(-1);

  return (
    <section className="card call">
      <h3>📣 ลงข้อมูลเวร {thaiMonthLabel(month)}</h3>

      {!editing && (
        <div className="call-due">
          {call ? (
            <>
              <span>
                ลงภายใน <b>{thaiDateLabel(call.due)}</b>{' '}
                <span className={left < 0 ? 'call-late' : left <= 2 ? 'call-soon' : 'muted'}>({leftText})</span>
              </span>
              <span className="muted small">ผู้จัด: {call.by}</span>
            </>
          ) : (
            <span className="muted">ยังไม่ได้ตั้งกำหนดส่ง</span>
          )}
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            {call ? 'แก้' : 'ตั้งกำหนดส่ง'}
          </button>
        </div>
      )}

      {editing && (
        <div className="call-edit">
          <label className="field col">
            ลงข้อมูลภายในวันที่
            <input type="date" value={due} max={lastDay} onChange={(e) => setDue(e.target.value)} />
          </label>
          <label className="field col">
            ผู้จัดเวรเดือนนี้
            <select value={by} onChange={(e) => setBy(e.target.value)}>
              <option value="">— เลือกชื่อ —</option>
              {state.people
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="row wrap">
            <button className="btn-primary" disabled={!due || !by} onClick={saveCall}>
              บันทึก
            </button>
            <button className="btn" onClick={() => setEditing(false)}>
              ยกเลิก
            </button>
            {call && (
              <button className="btn-danger" onClick={removeCall}>
                ลบ
              </button>
            )}
          </div>
        </div>
      )}

      <div className="call-ack">
        <span className="small">{me ? `${people.get(me)?.name}:` : 'เลือกชื่อด้านบนก่อน แล้วติ๊กยืนยัน'}</span>
        <div className="seg">
          {(['done', 'none'] as const).map((k) => (
            <button key={k} className={myAck === k ? 'seg-on want' : ''} disabled={!me || busy} onClick={() => ack(k)}>
              {myAck === k ? '☑' : '☐'} {ACK_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <details className="call-status">
        <summary>
          ยืนยันแล้ว <b>{total - status.pending.length}</b>/{total} คน
          {status.pending.length > 0 && <span className="muted"> · รอ {status.pending.length} คน</span>}
        </summary>
        {status.pending.length > 0 && (
          <div className="call-group">
            <span className="small">⏳ ยังไม่ยืนยัน</span>
            {status.pending.map((id) => (
              <span key={id} className="call-person">
                <Chip person={people.get(id)} small />
                {withReq.has(id) && <span className="muted small">ลงแล้ว รอติ๊ก</span>}
              </span>
            ))}
          </div>
        )}
        {(['done', 'none'] as const).map((k) =>
          status[k].length ? (
            <div key={k} className="call-group">
              <span className="small">{k === 'done' ? '✅' : '🙆'} {ACK_LABEL[k]}</span>
              {status[k].map((id) => (
                <Chip key={id} person={people.get(id)} small />
              ))}
            </div>
          ) : null,
        )}
      </details>

      <div className="row wrap">
        <button className="btn line-btn" onClick={() => share('open')}>
          💬 แจ้งในกลุ่ม LINE
        </button>
        {status.pending.length > 0 && (
          <button className="btn" onClick={() => share('remind')}>
            🔔 เตือนคนที่ยังไม่ยืนยัน
          </button>
        )}
        <button className="btn" onClick={copy}>
          {copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกข้อความ'}
        </button>
      </div>
      <p className="muted small">กดแจ้งแล้วจะเปิด LINE ให้เลือกกลุ่มแล้วกดส่ง (ข้อความมีลิงก์กลับมาหน้านี้)</p>
    </section>
  );
}
