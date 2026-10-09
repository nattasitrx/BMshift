import { useState } from 'react';
import { templateCells, templateLetters } from '../engine/blocks';
import { dateRange, monthOf, shiftMonth, thaiDateLabel, thaiMonthLabel, toISO } from '../engine/dates';
import {
  arrangeFestival,
  festivalTemplates,
  findFestival,
  listFestivalBlocks,
  removeFestival,
  setFestivalPerson,
  type FestivalBlock,
} from '../engine/festival';
import { SLOT_LABEL, SLOTS, type AppState, type FestivalKind, type FestivalRecord, type Person, type ShiftRequest, type Template } from '../engine/types';
import { syncBaselines } from '../engine/swaps';
import { listRequests } from './api';
import type { Ctx } from './App';
import { Chip, Modal } from './common';

const NAME = { newyear: 'ปีใหม่', songkran: 'สงกรานต์' } as const;

export function FestivalView({ state, mode, commit }: Ctx) {
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<string[]>([]);
  const [pick, setPick] = useState<{ f: FestivalRecord; letter: string } | null>(null);
  const [tplChoice, setTplChoice] = useState<Record<string, string>>({});
  const from = shiftMonth(toISO(new Date()).slice(0, 7), -2);
  const blocks = listFestivalBlocks(state, from, 18);
  const people = new Map(state.people.map((p) => [p.id, p]));
  const active = state.people.filter((p) => p.active);

  const arrange = async (b: FestivalBlock) => {
    const f = findFestival(state, b);
    if (f && !confirm(`จัด${NAME[b.kind]}ใหม่? ตำแหน่ง A, B, C… จะถูกจัดใหม่จากกลุ่มที่เลือกไว้`)) return;
    setBusy(b.start);
    try {
      const months = [...new Set([b.eve, ...b.days].map(monthOf))];
      const reqs: ShiftRequest[] = (await Promise.all(months.map((m) => listRequests(mode, m)))).flat();
      const r = arrangeFestival(state, reqs, b, { templateId: tplChoice[b.start] ?? f?.templateId });
      if ('error' in r) {
        setMsg([r.error]);
        return;
      }
      const generated = months.filter((m) => state.months[m]);
      setMsg([
        ...r.warnings,
        ...(generated.length
          ? [`${generated.map(thaiMonthLabel).join(', ')} จัดเวรไว้แล้ว — กด "จัดใหม่อัตโนมัติ" ในเดือนนั้นอีกครั้งเพื่อหักยอดเวรเทศกาล`]
          : []),
      ]);
      await commit(syncBaselines(state, r.state));
    } finally {
      setBusy('');
    }
  };

  const remove = async (f: FestivalRecord) => {
    if (!confirm(`ลบการจัด${NAME[f.kind]}? เวรในช่วงนี้จะว่าง`)) return;
    await commit(syncBaselines(state, removeFestival(state, f)));
  };


  return (
    <div>
      <p className="muted">
        ปีใหม่และสงกรานต์จัดแยกไว้ก่อน แล้วตอนจัดเวรรายเดือน ระบบจะนับเวรเทศกาลเข้ายอดของแต่ละคนก่อน แล้วค่อยเฉลี่ยเวรที่เหลือ
      </p>
      <GroupPicker state={state} commit={commit} />
      {msg.length > 0 && (
        <div className="card">
          <ul className="issues">
            {msg.map((m, k) => (
              <li key={k} className="warn">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      {blocks.length === 0 && (
        <div className="card muted">
          ไม่พบวันหยุดปีใหม่/สงกรานต์ในช่วงนี้ — เพิ่มวันหยุดและติ๊กประเภท "ปีใหม่" หรือ "สงกรานต์" ในหน้าตั้งค่า
        </div>
      )}
      {blocks.map((b) => {
        const f = findFestival(state, b);
        const options = festivalTemplates(state, b);
        const groupSize = active.filter((p) => state.festivalGroup[p.id] === b.kind).length;
        const chosenId =
          tplChoice[b.start] ??
          f?.templateId ??
          options.find((o) => templateLetters(o).length === groupSize)?.id ??
          options[0]?.id ??
          '';
        const t = state.templates.find((x) => x.id === (f?.templateId ?? chosenId));
        return (
          <section key={b.start} className="card">
            <h3>
              {NAME[b.kind]} {Number(b.start.slice(0, 4)) + 543}
            </h3>
            <p className="small muted">
              {thaiDateLabel(b.start)} – {thaiDateLabel(b.end)} ({b.days.length} วัน) · รวมบ่าย/ดึกคืน {thaiDateLabel(b.eve)}
            </p>
            {options.length === 0 ? (
              <p className="req-off small">
                ไม่มีแพทเทิร์น{NAME[b.kind]} {b.days.length} วัน — เพิ่มในหน้าตั้งค่า (หรือตรวจวันหยุดว่าครบตามประกาศ)
              </p>
            ) : (
              <div className="row wrap">
                <select
                  value={chosenId}
                  onChange={(e) => setTplChoice({ ...tplChoice, [b.start]: e.target.value })}
                  aria-label="แพทเทิร์น"
                >
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button className="btn-primary" disabled={!!busy} onClick={() => arrange(b)}>
                  {busy === b.start ? 'กำลังจัด…' : f ? '🔄 จัดใหม่' : '✨ จัดอัตโนมัติ'}
                </button>
                {f && (
                  <button className="btn-danger" onClick={() => remove(f)}>
                    ลบ
                  </button>
                )}
              </div>
            )}
            {f && t && (
              <>
                {f.templateId !== chosenId && (
                  <p className="small muted">เปลี่ยนแพทเทิร์นแล้ว กด "จัดใหม่" เพื่อใช้แพทเทิร์นใหม่</p>
                )}
                {(f.start !== b.start || f.end !== b.end) && (
                  <p className="small req-off">
                    วันหยุดเปลี่ยน (จัดไว้ {thaiDateLabel(f.start)} – {thaiDateLabel(f.end)}) — กด "จัดใหม่" ให้ตรงกับวันหยุดล่าสุด
                  </p>
                )}
                {!sameGroup(f, state, b.kind) && (
                  <p className="small req-off">คนที่จัดไว้ไม่ตรงกับกลุ่มที่เลือกตอนนี้ — กด "จัดใหม่" เพื่อใช้กลุ่มล่าสุด</p>
                )}
                <LetterList f={f} t={t} people={people} onPick={(letter) => setPick({ f, letter })} />
                <FestivalGrid f={f} t={t} people={people} />
              </>
            )}
          </section>
        );
      })}

      {pick && (
        <Modal title={`${NAME[pick.f.kind]} · ตำแหน่ง ${pick.letter}`} onClose={() => setPick(null)}>
          <div className="picker">
            {active.map((p) => {
              const other = Object.entries(pick.f.people).find(([l, id]) => id === p.id && l !== pick.letter)?.[0];
              return (
                <button
                  key={p.id}
                  className="pick"
                  onClick={async () => {
                    setPick(null);
                    await commit(syncBaselines(state, setFestivalPerson(state, pick.f, pick.letter, p.id)));
                  }}
                >
                  <Chip person={p} />
                  {other && <span className="muted small"> อยู่ {other} แล้ว</span>}
                </button>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

function LetterList({
  f,
  t,
  people,
  onPick,
}: {
  f: FestivalRecord;
  t: Template;
  people: Map<string, Person>;
  onPick: (letter: string) => void;
}) {
  const cells = templateCells({ eve: f.eve, days: dateRange(f.start, f.end) }, t);
  return (
    <div className="letters">
      {templateLetters(t).map((l) => {
        const mine = cells.filter((c) => c.letter === l);
        const counted = mine.filter((c) => c.slot !== 'S').length;
        const extra = mine.length - counted;
        return (
          <button key={l} className="letter" onClick={() => onPick(l)}>
            <b>{l}</b>
            <Chip person={people.get(f.people[l])} small />
            <span className="muted small">
              {counted} เวร{extra ? ` + เสริม ${extra}` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FestivalGrid({
  f,
  t,
  people,
}: {
  f: FestivalRecord;
  t: Template;
  people: Map<string, Person>;
}) {
  const dates = [f.eve, ...dateRange(f.start, f.end)];
  return (
    <div className="table-wrap">
      <table className="sched">
        <thead>
          <tr>
            <th>วันที่</th>
            {SLOTS.map((s) => (
              <th key={s}>{SLOT_LABEL[s]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, r) => (
            <tr key={r} className={r === 0 ? '' : 'off'}>
              <td className="date-cell">{thaiDateLabel(dates[r])}</td>
              {row.map((l, c) => {
                const p = l ? people.get(f.people[l]) : undefined;
                return (
                  <td key={c} className={l ? 'cell' : 'cell na'} style={p ? { background: p.color } : undefined}>
                    {p && <Chip person={p} small />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupPicker({ state, commit }: Pick<Ctx, 'state' | 'commit'>) {
  const active = state.people.filter((p) => p.active);
  const count = (k: FestivalKind) => active.filter((p) => state.festivalGroup[p.id] === k).length;
  const unset = active.filter((p) => !state.festivalGroup[p.id]);
  const set = (id: string, k: FestivalKind) => {
    const next: AppState = { ...state, festivalGroup: { ...state.festivalGroup, [id]: k } };
    commit(next);
  };
  return (
    <section className="card">
      <h3>ใครอยู่ปีใหม่ / สงกรานต์</h3>
      <p className="small">
        🎆 ปีใหม่ <b>{count('newyear')}</b> คน · 💦 สงกรานต์ <b>{count('songkran')}</b> คน
        {unset.length > 0 && <span className="req-off"> · ยังไม่เลือก {unset.length} คน</span>}
      </p>
      <div className="group-list">
        {active.map((p) => {
          const k = state.festivalGroup[p.id];
          return (
            <div key={p.id} className="group-row">
              <Chip person={p} small />
              <div className="seg seg-sm">
                <button className={k === 'newyear' ? 'seg-on' : ''} onClick={() => set(p.id, 'newyear')}>
                  ปีใหม่
                </button>
                <button className={k === 'songkran' ? 'seg-on' : ''} onClick={() => set(p.id, 'songkran')}>
                  สงกรานต์
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="muted small">
        จำนวนคนต้องตรงกับแพทเทิร์น (เช่น ปีใหม่ 4 วัน ใช้ 6 หรือ 7 คน) · เปลี่ยนกลุ่มแล้ว กด "จัดใหม่" ที่เทศกาลนั้นเพื่อใช้กลุ่มใหม่
      </p>
    </section>
  );
}

function sameGroup(f: FestivalRecord, state: AppState, kind: FestivalKind) {
  const arranged = new Set(Object.values(f.people));
  const group = state.people.filter((p) => p.active && state.festivalGroup[p.id] === kind).map((p) => p.id);
  return group.length === arranged.size && group.every((id) => arranged.has(id));
}
