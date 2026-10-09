import { useState } from 'react';
import { holidayMap, isOffDay } from '../engine/blocks';
import { BIT } from '../engine/cost';
import { daysInMonth, shiftMonth, thaiDateLabel, thaiMonthLabel } from '../engine/dates';
import { requestLabel, offBits, wantBits } from '../engine/requests';
import { summarizeMonth } from '../engine/summary';
import { SLOT_LABEL, type AppState, type Slot } from '../engine/types';
import type { Ctx } from './App';
import { Chip, getMe } from './common';
import { SlipView } from './SlipView';
import { personHistory, weekendRoleLabel, weekendRoleLoad } from '../engine/usage';


export function SummaryView(ctx: Ctx) {
  const [view, setView] = useState<'person' | 'slip' | 'pattern'>('person');
  return (
    <div>
      <div className="seg no-print">
        <button className={view === 'person' ? 'seg-on' : ''} onClick={() => setView('person')}>
          👤 รายคน
        </button>
        <button className={view === 'slip' ? 'seg-on' : ''} onClick={() => setView('slip')}>
          🧾 ใบเวรน้อย
        </button>
        <button className={view === 'pattern' ? 'seg-on' : ''} onClick={() => setView('pattern')}>
          🔁 แพทเทิร์น
        </button>
      </div>
      {view === 'person' && <PersonSummary {...ctx} />}
      {view === 'slip' && <SlipView {...ctx} />}
      {view === 'pattern' && <PatternSummary state={ctx.state} month={ctx.month} />}
    </div>
  );
}

function PersonSummary({ state, requests, month }: Ctx) {
  const active = state.people.filter((p) => p.active);
  const [id, setId] = useState(() => (active.some((p) => p.id === getMe()) ? getMe() : (active[0]?.id ?? '')));
  const hol = holidayMap(state.holidays);
  const person = state.people.find((p) => p.id === id);
  const row = summarizeMonth(state, month).find((r) => r.id === id);
  const shifts = daysInMonth(month)
    .map((d) => ({
      d,
      slots: (['O', 'I', 'S', 'PM', 'N', 'SMC'] as const).filter((s) => state.days[d]?.[s] === id),
    }))
    .filter((x) => x.slots.length);
  const festivals = (state.festivals ?? []).filter(
    (f) => Object.values(f.people).includes(id) && (f.start.startsWith(month) || f.end.startsWith(month) || f.eve.startsWith(month)),
  );
  const mine = requests.filter((r) => r.personId === id).sort((a, b) => a.date.localeCompare(b.date));
  const bitsOn = (d: string) =>
    (['O', 'I', 'S', 'PM', 'N', 'SMC'] as const).reduce((m, s) => (state.days[d]?.[s] === id ? m | BIT[s] : m), 0);

  return (
    <div>
      <section className="card">
        <label className="field">
          ชื่อ
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {row && (
          <div className="stat-row">
            <Stat label="เวรรวม" value={row.total} strong />
            <Stat label="เช้า" value={row.morning} />
            <Stat label="บ่าย" value={row.afternoon} />
            <Stat label="ดึก" value={row.night} />
            <Stat label="เสริม" value={row.extra} />
            <Stat label="SMC" value={row.smc} />
          </div>
        )}
        <p className="small">
          เสาร์–อาทิตย์: {row?.weekendRoles.length ? row.weekendRoles.map((r) => weekendRoleLabel(state, r, 'long')).join(', ') : 'ไม่มี'}
          {festivals.map((f) => (
            <span key={f.start}> · {f.kind === 'newyear' ? 'ปีใหม่' : 'สงกรานต์'}</span>
          ))}
        </p>
      </section>

      <section className="card">
        <h3>
          เวรของ <Chip person={person} small /> เดือน{thaiMonthLabel(month)} ({shifts.length} วัน)
        </h3>
        {shifts.length === 0 && <p className="muted">ยังไม่มีเวร (เดือนนี้อาจยังไม่ได้จัด)</p>}
        <ul className="req-list">
          {shifts.map(({ d, slots }) => (
            <li key={d} className={isOffDay(d, hol) ? 'off-row' : ''}>
              <span className="nowrap date-col">{thaiDateLabel(d)}</span>
              <span className="grow">
                {slots.map((s) => (
                  <span key={s} className={`shift-tag t-${s}`}>
                    {SLOT_LABEL[s as Slot | 'SMC']}
                  </span>
                ))}
              </span>
              {hol.has(d) && <span className="muted small">{hol.get(d)!.name}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>คำขอเดือนนี้ ({mine.length})</h3>
        {mine.length === 0 && <p className="muted">ไม่มี</p>}
        <ul className="req-list">
          {mine.map((r) => {
            const got = bitsOn(r.date);
            const ok = r.type === 'off' ? !(got & offBits(r.slot)) : (got & wantBits(r.slot)) !== 0;
            return (
              <li key={r.id}>
                <span className="nowrap date-col">{thaiDateLabel(r.date)}</span>
                <span className={'grow ' + (r.type === 'off' ? 'req-off' : 'req-want')}>{requestLabel(r)}</span>
                {state.months[month] ? (
                  <span className={ok ? 'req-want' : 'req-off'}>{ok ? '✓ ได้ตามขอ' : '✗ ไม่ได้ตามขอ'}</span>
                ) : (
                  <span className="muted small">ยังไม่ได้จัด</span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={'stat' + (strong ? ' strong' : '')}>
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

interface PatternRow {
  id: string;
  A: number;
  B: number;
  C: number;
  weekends: number;
  noWeekend: number;
  twoWeekend: number;
  adjacent: number;
  midweek: number;
  extra: number;
  newyear: number;
  songkran: number;
  last: string;
}

function patternRows(state: AppState, months: string[]): PatternRow[] {
  const rows = new Map<string, PatternRow>();
  const get = (id: string) => {
    if (!rows.has(id)) {
      rows.set(id, { id, A: 0, B: 0, C: 0, weekends: 0, noWeekend: 0, twoWeekend: 0, adjacent: 0, midweek: 0, extra: 0, newyear: 0, songkran: 0, last: '' });
    }
    return rows.get(id)!;
  };
  for (const p of state.people.filter((x) => x.active)) get(p.id);
  for (const m of [...months].sort()) {
    const rec = state.months[m];
    if (!rec) continue;
    for (const [id, roles] of Object.entries(rec.weekendRoles ?? {})) {
      const r = get(id);
      for (const role of roles) {
        if (role === 'A' || role === 'B' || role === 'C') r[role]++;
        r.weekends++;
        r.last = `${weekendRoleLabel(state, role)} (${thaiMonthLabel(m)})`;
      }
    }
    for (const id of rec.noWeekend ?? []) get(id).noWeekend++;
    for (const id of rec.twoWeekend ?? []) get(id).twoWeekend++;
    for (const b of rec.blocks) {
      if (b.kind === 'adjacent' || b.kind === 'midweek') for (const id of new Set(Object.values(b.people))) get(id)[b.kind]++;
      if (b.kind === 'weekend' && b.extraId) get(b.extraId).extra++;
    }
  }
  for (const f of state.festivals ?? []) {
    if (!months.includes(f.start.slice(0, 7)) && !months.includes(f.eve.slice(0, 7))) continue;
    for (const id of new Set(Object.values(f.people))) get(id)[f.kind]++;
  }
  return [...rows.values()];
}

function PatternSummary({ state, month }: { state: AppState; month: string }) {
  const [range, setRange] = useState<'12' | 'all'>('12');
  const all = Object.keys(state.months).filter((m) => m <= month);
  const months = range === 'all' ? all : all.filter((m) => m > shiftMonth(month, -12));
  const rows = patternRows(state, months);
  const people = new Map(state.people.map((p) => [p.id, p]));
  const [open, setOpen] = useState<string | null>(null);
  const role = (r: 'A' | 'B' | 'C') => ({ key: r, label: weekendRoleLabel(state, r), hint: `${weekendRoleLoad(state, r)} เวร` });
  const cols: { key: keyof PatternRow; label: string; hint?: string }[] = [
    role('A'),
    role('B'),
    role('C'),
    { key: 'weekends', label: 'ส-อา รวม' },
    { key: 'noWeekend', label: 'ไม่อยู่ ส-อา' },
    { key: 'twoWeekend', label: '2 รอบ' },
    { key: 'extra', label: 'เสริม' },
    { key: 'adjacent', label: 'หยุดติดกัน' },
    { key: 'midweek', label: 'หยุดไม่ติดกัน' },
    { key: 'newyear', label: 'ปีใหม่' },
    { key: 'songkran', label: 'สงกรานต์' },
  ];
  const max = (k: keyof PatternRow) => Math.max(...rows.map((r) => Number(r[k]) || 0));
  const min = (k: keyof PatternRow) => Math.min(...rows.map((r) => Number(r[k]) || 0));

  return (
    <section className="card">
      <div className="row wrap">
        <h3 style={{ margin: 0 }}>แพทเทิร์นสะสม</h3>
        <span className="spacer" />
        <div className="seg seg-sm">
          <button className={range === '12' ? 'seg-on' : ''} onClick={() => setRange('12')}>
            12 เดือนล่าสุด
          </button>
          <button className={range === 'all' ? 'seg-on' : ''} onClick={() => setRange('all')}>
            ทั้งหมด
          </button>
        </div>
      </div>
      <p className="muted small">
        นับถึง{thaiMonthLabel(month)} ({months.length} เดือนที่จัดแล้ว) · <span className="hi">ตัวหนาแดง</span> = มากสุด,{' '}
        <span className="lo">เขียว</span> = น้อยสุด ในคอลัมน์ · {weekendRoleLabel(state, 'C')} หนักสุด (4 เวร) ควรกระจายให้เท่ากัน ·
        แตะชื่อเพื่อดูว่าอยู่อะไร เดือนไหน
      </p>
      <div className="table-wrap">
        <table className="summary pattern">
          <thead>
            <tr>
              <th>ชื่อ</th>
              {cols.map((c) => (
                <th key={c.key}>
                  {c.label}
                  {c.hint && <div className="muted small">{c.hint}</div>}
                </th>
              ))}
              <th>ล่าสุด</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => [
              <tr key={r.id} className="clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <td className="nowrap">
                  <span className="caret">{open === r.id ? '▾' : '▸'}</span> <Chip person={people.get(r.id)} small />
                </td>
                {cols.map((c) => {
                  const v = Number(r[c.key]) || 0;
                  const hi = max(c.key) !== min(c.key) && v === max(c.key);
                  const lo = max(c.key) !== min(c.key) && v === min(c.key);
                  return (
                    <td key={c.key} className={hi ? 'hi' : lo ? 'lo' : ''}>
                      {v}
                    </td>
                  );
                })}
                <td className="nowrap small">{r.last || '–'}</td>
              </tr>,
              open === r.id && (
                <tr key={`${r.id}-detail`} className="detail-row">
                  <td colSpan={cols.length + 2}>
                    <HistoryList state={state} id={r.id} months={months} />
                  </td>
                </tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        เดือนที่นำเข้าจากรูป (พ.ย. 69) มีเฉพาะตำแหน่งเสาร์–อาทิตย์และเวรเสริม · "ไม่อยู่ ส-อา" และ "2 รอบ" เริ่มนับจากเดือนที่จัดด้วยระบบรุ่นนี้
      </p>
    </section>
  );
}

const KIND_ICON: Record<string, string> = {
  weekend: '📅',
  extra: '✳️',
  adjacent: '🏖️',
  midweek: '📌',
  newyear: '🎆',
  songkran: '💦',
  noWeekend: '⏸️',
  twoWeekend: '➕',
};

function HistoryList({ state, id, months }: { state: AppState; id: string; months: string[] }) {
  const items = personHistory(state, id, [...months].sort());
  if (!items.length) return <p className="muted small">ยังไม่มีประวัติในช่วงนี้</p>;
  let last = '';
  return (
    <ul className="history">
      {items.map((e, k) => {
        const head = e.month !== last ? thaiMonthLabel(e.month) : '';
        last = e.month;
        return (
          <li key={k}>
            <span className="h-month">{head}</span>
            <span>
              {KIND_ICON[e.kind]} {e.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
