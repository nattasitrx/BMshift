import { useMemo, useState } from 'react';
import { holidayMap, isOffDay } from '../engine/blocks';
import { daysInMonth, shiftMonth, thaiDateLabel, thaiDayShort, thaiMonthLabel } from '../engine/dates';
import { clearMonth, generateBest } from '../engine/generate';
import { undoMonth, withHistory } from '../engine/history';
import { BIT } from '../engine/cost';
import { indexRequests, REQUEST_SLOT_LABEL } from '../engine/requests';
import { describeChange, holidayChange } from '../engine/holidayCheck';
import { findIssues, summarizeMonth } from '../engine/summary';
import { SLOT_LABEL, type AppState, type Slot } from '../engine/types';
import type { Ctx } from './App';
import { Chip, clone, Modal } from './common';
import { ACTION_LABEL, formatWhen, GenerateDialog, type MonthAction } from './GenerateDialog';
import { PrintSheet } from './PrintSheet';

type Col = Slot | 'SMC';
const COLS: Col[] = ['O', 'I', 'S', 'PM', 'N', 'SMC'];
const ROLE_LOAD: Record<string, string> = { A: 'A (3 เวร)', B: 'B (3 เวร)', C: 'C (4 เวร)' };

export function ScheduleView({ state, commit, requests, month }: Ctx) {
  const [edit, setEdit] = useState<{ date: string; col: Col } | null>(null);
  const [dialog, setDialog] = useState(false);
  const people = new Map(state.people.map((p) => [p.id, p]));
  const hol = holidayMap(state.holidays);
  const days = daysInMonth(month);
  const record = state.months[month];
  const issues = useMemo(
    () => findIssues(state.days, state.people, requests, month, state.holidays),
    [state.days, state.people, requests, month, state.holidays],
  );
  const summary = useMemo(() => summarizeMonth(state, month), [state, month]);
  const reqByDate = new Map<string, { off: string[]; want: string[] }>();
  for (const r of requests) {
    const e = reqByDate.get(r.date) ?? { off: [], want: [] };
    const who = people.get(r.personId)?.name ?? r.personId;
    e[r.type].push(r.slot && r.slot !== 'day' ? `${who}(${REQUEST_SLOT_LABEL[r.slot]})` : who);
    reqByDate.set(r.date, e);
  }
  const reqIdx = indexRequests(requests);

  const run = async (action: MonthAction, byId: string) => {
    const by = people.get(byId)?.name ?? byId;
    await new Promise((r) => setTimeout(r, 30));
    if (action === 'undo') {
      await commit(undoMonth(state, month, by));
      return;
    }
    let next: AppState;
    if (action === 'clear') {
      next = clearMonth(state, month);
    } else {
      const r = generateBest(state, requests, month, action === 'extra' ? 2 : 4, Date.now(), action);
      next = clone(state);
      next.days = r.days;
      next.months[month] = r.record;
      const latest = Object.keys(state.months).sort().pop() ?? month;
      if (month >= latest) next.queues = r.queues;
    }
    await commit(withHistory(state, next, month, by, ACTION_LABEL[action]));
  };
  const holChange = holidayChange(state, month);
  const pendingHol = state.holidays.filter((h) => h.pending && h.date.startsWith(month));
  const log = state.monthLog?.[month] ?? [];
  const lastLog = log[log.length - 1];
  const stages = new Set(record?.stages ?? (record ? ['extra', 'weekend', 'rest'] : []));

  const setCell = async (date: string, col: Col, id: string | null) => {
    const next = clone(state);
    const a = { ...(next.days[date] ?? {}) };
    if (id) a[col] = id;
    else delete a[col];
    next.days[date] = a;
    const rec = next.months[month];
    if (col === 'SMC' && rec) {
      rec.smcDays = id ? [...new Set([...rec.smcDays, date])].sort() : rec.smcDays.filter((d) => d !== date);
    }
    setEdit(null);
    await commit(next);
  };

  const issueDates = new Set(issues.filter((i) => i.level === 'error').map((i) => i.date));

  return (
    <div>
      <div className="toolbar no-print">
        <button className="btn-primary" onClick={() => setDialog(true)}>
          ⚙️ จัดเวร…
        </button>
        <button className="btn" onClick={() => window.print()}>
          🖨️ พิมพ์
        </button>
      </div>
      {holChange && (
        <div className="alert no-print">
          <b>⚠️ วันหยุดของเดือนนี้เปลี่ยนหลังจากจัดเวรแล้ว</b>
          <div className="small">{describeChange(state, holChange)}</div>
          <div className="small">
            กด ⚙️ จัดเวร… แล้วเลือก "จัดเสาร์–อาทิตย์และวันหยุด" (ตามด้วยจัดวันธรรมดา) หรือ "จัดทั้งหมดใหม่"
          </div>
        </div>
      )}
      {pendingHol.length > 0 && (
        <p className="small pending-note no-print">
          <span className="badge-pending">รอตรวจ</span> วันหยุดเดือนนี้ที่ยังไม่ได้เทียบกับประกาศ:{' '}
          {pendingHol.map((h) => `${thaiDateLabel(h.date)} ${h.name}`).join(', ')} — ตรวจในหน้าตั้งค่า
        </p>
      )}
      <div className="month-status no-print">
        <span className={stages.has('extra') ? 'st done' : 'st'}>เสริม</span>
        <span className={stages.has('weekend') ? 'st done' : 'st'}>เสาร์–อาทิตย์/วันหยุด</span>
        <span className={stages.has('rest') ? 'st done' : 'st'}>วันธรรมดา + SMC</span>
      </div>
      {lastLog ? (
        <p className="small no-print">
          ล่าสุด: <b>{lastLog.by}</b> — {lastLog.action} ({formatWhen(lastLog.at)})
        </p>
      ) : (
        !record && (
          <p className="muted no-print">
            เดือนนี้ยังไม่ได้จัด
            {!state.months[shiftMonth(month, -1)] && ' (เดือนก่อนหน้ายังไม่ได้จัด ระบบจะใช้คิวปัจจุบัน)'}
          </p>
        )
      )}

      <PrintSheet state={state} month={month} />
      <div className="table-wrap no-print">
        <table className="sched">
          <thead>
            <tr>
              <th>วันที่</th>
              {COLS.map((c) => (
                <th key={c}>{SLOT_LABEL[c]}</th>
              ))}
              <th className="col-req">ไม่ว่าง / ขออยู่</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const off = isOffDay(d, hol);
              const a = state.days[d] ?? {};
              const rq = reqByDate.get(d);
              return (
                <tr key={d} className={(off ? 'off ' : '') + (issueDates.has(d) ? 'has-issue' : '')}>
                  <td className="date-cell">
                    <b>{Number(d.slice(8))}</b> <span className="dow">{thaiDayShort(d)}</span>
                    {hol.has(d) && <div className="hol-name">{hol.get(d)!.name}</div>}
                  </td>
                  {COLS.map((c) => {
                    const usable = off ? c !== 'SMC' : c === 'PM' || c === 'N' || c === 'SMC';
                    const p = a[c] ? people.get(a[c]!) : undefined;
                    return (
                      <td
                        key={c}
                        className={usable ? 'cell' : 'cell na'}
                        style={p ? { background: p.color } : undefined}
                        onClick={usable ? () => setEdit({ date: d, col: c }) : undefined}
                      >
                        {p && <Chip person={p} small />}
                      </td>
                    );
                  })}
                  <td className="col-req">
                    {rq?.off.length ? <span className="req-off">{rq.off.join('/')}</span> : null}
                    {rq?.want.length ? <span className="req-want"> *ขออยู่ {rq.want.join('/')}</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {issues.length > 0 && (
        <section className="card">
          <h3>⚠️ ตรวจพบ</h3>
          <ul className="issues">
            {issues.map((i, k) => (
              <li key={k} className={i.level}>
                {thaiDateLabel(i.date)} — {i.message}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h3>สรุปจำนวนเวร</h3>
        <div className="table-wrap">
          <table className="summary">
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>เวรรวม</th>
                <th>เช้า</th>
                <th>บ่าย</th>
                <th>ดึก</th>
                <th>เสริม</th>
                <th>SMC</th>
                <th>ส-อา</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Chip person={people.get(r.id)} small />
                  </td>
                  <td>
                    <b>{r.total}</b>
                  </td>
                  <td>{r.morning}</td>
                  <td>{r.afternoon}</td>
                  <td>{r.night}</td>
                  <td>{r.extra}</td>
                  <td>{r.smc}</td>
                  <td className="nowrap">{r.weekendRoles.map((x) => ROLE_LOAD[x] ?? x).join(', ') || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small">เวรรวม = OPD + IPD + บ่าย + ดึก (ไม่นับเสริมและ SMC) นับตามวันที่ในเดือนนี้</p>
      </section>

      {record && (
        <section className="card no-print">
          <h3>ระบบตัดสินใจอย่างไร</h3>
          <ul className="info">
            {record.info.map((x, k) => (
              <li key={k}>{x}</li>
            ))}
          </ul>
          {record.warnings.length > 0 && (
            <ul className="issues">
              {record.warnings.map((x, k) => (
                <li key={k} className="error">
                  {x}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {log.length > 0 && (
        <section className="card no-print">
          <h3>ประวัติการจัดเวรเดือนนี้</h3>
          <ul className="info">
            {[...log].reverse().map((e, k) => (
              <li key={k}>
                {formatWhen(e.at)} — <b>{e.by}</b> {e.action}
              </li>
            ))}
          </ul>
        </section>
      )}

      {dialog && <GenerateDialog state={state} month={month} onClose={() => setDialog(false)} onRun={run} />}

      {edit && (
        <Modal title={`${thaiDateLabel(edit.date)} · ${SLOT_LABEL[edit.col]}`} onClose={() => setEdit(null)}>
          <div className="picker">
            {state.people
              .filter((p) => p.active)
              .map((p) => {
                const isOff = (reqIdx.off(p.id, edit.date) & BIT[edit.col]) !== 0;
                const busyToday = COLS.filter((c) => c !== edit.col && state.days[edit.date]?.[c] === p.id);
                return (
                  <button key={p.id} className="pick" onClick={() => setCell(edit.date, edit.col, p.id)}>
                    <Chip person={p} />
                    {isOff && <span className="req-off"> ไม่ว่าง</span>}
                    {busyToday.length > 0 && (
                      <span className="muted small"> มี{busyToday.map((c) => SLOT_LABEL[c]).join('/')}แล้ว</span>
                    )}
                  </button>
                );
              })}
            <button className="pick pick-clear" onClick={() => setCell(edit.date, edit.col, null)}>
              — ว่าง —
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
