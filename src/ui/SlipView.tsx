import { useState } from 'react';
import { daysInMonth, thaiDateLabel, thaiMonthLabel } from '../engine/dates';
import { printName } from '../engine/names';
import { baht, paidSlots, slipFor, type Slip } from '../engine/pay';
import type { AppState } from '../engine/types';
import type { Ctx } from './App';
import { Chip, getMe } from './common';

// ใบเวรน้อย: ดูบนจอทีละคน / พิมพ์หลายคน (8 ใบต่อ A4 มีเส้นประไว้ตัด)

const MORNING_LABEL = { O: 'OPD', I: 'IPD', S: 'เสริม' } as const;

function SlipCard({ state, slip }: { state: AppState; slip: Slip }) {
  const p = state.people.find((x) => x.id === slip.personId);
  if (!p) return null;
  const real = printName(p);
  const paid = new Set(paidSlots(state));
  const withSmc = paid.has('SMC');
  // แสดงเฉพาะวันที่มีเวรที่นับค่าเวร
  const rows = slip.rows.filter((r) => r.count > 0);
  const morning = (slots: Slip['rows'][number]['slots']) =>
    slots.filter((x): x is 'O' | 'I' | 'S' => (x === 'O' || x === 'I' || x === 'S') && paid.has(x));
  const total = (pred: (r: Slip['rows'][number]) => number) => rows.reduce((n, r) => n + pred(r), 0);
  return (
    <div className={'slip' + (rows.length > 10 ? ' dense' : '')}>
      <div className="slip-head">
        <b>ใบเวรน้อย</b>
        <span>เดือน{thaiMonthLabel(slip.month)}</span>
      </div>
      <div className="slip-name">
        ชื่อ <b>{real}</b>
        {real !== p.name && <span> ({p.name})</span>}
      </div>
      {rows.length === 0 ? (
        <div className="slip-empty">ไม่มีเวรเดือนนี้</div>
      ) : (
        <table className="slip-table">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>เช้า</th>
              <th>บ่าย</th>
              <th>ดึก</th>
              {withSmc && <th>SMC</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const m = morning(r.slots);
              return (
                <tr key={r.date}>
                  <td className="d">{thaiDateLabel(r.date)}</td>
                  <td>{m.length ? `✓ (${m.map((x) => MORNING_LABEL[x]).join('/')})` : ''}</td>
                  <td>{r.slots.includes('PM') ? '✓' : ''}</td>
                  <td>{r.slots.includes('N') ? '✓' : ''}</td>
                  {withSmc && <td>{r.slots.includes('SMC') ? '✓' : ''}</td>}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="d">รวม</td>
              <td>{total((r) => morning(r.slots).length)}</td>
              <td>{total((r) => (r.slots.includes('PM') ? 1 : 0))}</td>
              <td>{total((r) => (r.slots.includes('N') ? 1 : 0))}</td>
              {withSmc && <td>{total((r) => (r.slots.includes('SMC') ? 1 : 0))}</td>}
            </tr>
          </tfoot>
        </table>
      )}
      <div className="slip-total">
        รวม <b>{slip.count}</b> เวร × {baht(slip.rate)} = <b>{baht(slip.total)}</b> บาท
      </div>
    </div>
  );
}

export function SlipView({ state, month }: Ctx) {
  const active = state.people.filter((p) => p.active);
  const [id, setId] = useState(() => (active.some((p) => p.id === getMe()) ? getMe() : (active[0]?.id ?? '')));
  const slips = active.map((p) => slipFor(state, month, p.id));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(slips.filter((s) => s.rows.length).map((s) => s.personId)));
  const toPrint = slips.filter((s) => picked.has(s.personId));
  const generated = !!state.months[month] || daysInMonth(month).some((d) => state.days[d]);
  const sum = toPrint.reduce((n, s) => n + s.total, 0);

  return (
    <div>
      <section className="card no-print">
        <label className="field">
          ดูของ
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {!generated && <p className="muted small">เดือนนี้ยังไม่ได้จัดเวร</p>}
      </section>
      <div className="slip-screen no-print">
        <SlipCard state={state} slip={slipFor(state, month, id)} />
      </div>

      <section className="card no-print">
        <h3>พิมพ์ใบเวรน้อย</h3>
        <div className="row wrap">
          <button className="btn" onClick={() => setPicked(new Set(active.map((p) => p.id)))}>
            เลือกทุกคน
          </button>
          <button className="btn" onClick={() => setPicked(new Set())}>
            ไม่เลือกเลย
          </button>
        </div>
        <div className="pick-list">
          {slips.map((s) => {
            const p = state.people.find((x) => x.id === s.personId);
            return (
              <label key={s.personId} className="check pick-row">
                <input
                  type="checkbox"
                  checked={picked.has(s.personId)}
                  onChange={(e) => {
                    const next = new Set(picked);
                    if (e.target.checked) next.add(s.personId);
                    else next.delete(s.personId);
                    setPicked(next);
                  }}
                />
                <Chip person={p} small />
                <span className="muted small">
                  {s.count} เวร · {baht(s.total)} บาท
                </span>
              </label>
            );
          })}
        </div>
        <p className="small">
          เลือก {toPrint.length} คน · รวม {baht(sum)} บาท · พิมพ์ได้ {Math.ceil(toPrint.length / 8) || 0} หน้า (A4 หน้าละ 8 ใบ)
        </p>
        <button className="btn-primary wide" disabled={!toPrint.length} onClick={() => window.print()}>
          🖨️ พิมพ์ใบเวรน้อย {toPrint.length} คน
        </button>
      </section>

      <div className="print-only">
        {Array.from({ length: Math.ceil(toPrint.length / 8) }, (_, page) => (
          <div key={page} className="slip-page">
            {toPrint.slice(page * 8, page * 8 + 8).map((s) => (
              <SlipCard key={s.personId} state={state} slip={s} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
