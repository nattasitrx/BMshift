import { useEffect, useState } from 'react';
import { thaiDateLabel, thaiMonthLabel, weekday } from '../engine/dates';
import { normalizeQueues } from '../engine/generate';
import { changedMonths, describeChange } from '../engine/holidayCheck';
import { seedState } from '../engine/seed';
import { SLOT_LABEL, SLOTS, TEMPLATE_KIND_LABEL, type AppState, type Holiday, type Template, type TemplateKind } from '../engine/types';
import { newId } from './api';
import type { Ctx } from './App';
import { clone, textOn } from './common';

type Draft = Pick<AppState, 'people' | 'holidays' | 'templates' | 'settings'>;
const pick = (s: AppState): Draft => clone({ people: s.people, holidays: s.holidays, templates: s.templates, settings: s.settings });

export function SettingsView({ state, commit }: Ctx) {
  const [d, setD] = useState<Draft>(() => pick(state));
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setD(pick(state));
    setDirty(false);
  }, [state]);

  const update = (f: (x: Draft) => void) => {
    const x = clone(d);
    f(x);
    setD(x);
    setDirty(true);
  };

  const save = async () => {
    const next = { ...clone(state), ...clone(d) };
    next.holidays.sort((a, b) => a.date.localeCompare(b.date));
    next.queues = normalizeQueues(next.queues, next.people.map((p) => p.id));
    if (await commit(next)) {
      setDirty(false);
      const before = new Set(changedMonths(state).map((c) => c.month));
      const affected = changedMonths(next).filter((c) => !before.has(c.month));
      if (affected.length) {
        alert(
          'วันหยุดเปลี่ยน กระทบเดือนที่จัดเวรไว้แล้ว — ไปกดจัดเวรเดือนนั้นใหม่:\n\n' +
            affected.map((c) => `• ${thaiMonthLabel(c.month)}: ${describeChange(next, c)}`).join('\n'),
        );
      }
    }
  };

  return (
    <div>
      <PeopleSection d={d} update={update} />
      <HolidaySection d={d} update={update} />
      <TemplateSection d={d} update={update} />

      <section className="card">
        <h3>ตัวเลือก</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={d.settings.festivalCountsAsWeekend}
            onChange={(e) => update((x) => (x.settings.festivalCountsAsWeekend = e.target.checked))}
          />
          คนที่อยู่ปีใหม่/สงกรานต์ในเดือนนั้น นับว่าอยู่เสาร์–อาทิตย์แล้ว
        </label>
        <p className="muted small">หยุดติดกันแบบปกติ (ไม่ใช่เทศกาล) นับว่าอยู่เสาร์–อาทิตย์แล้วเสมอ</p>
      </section>

      <BackupSection state={state} commit={commit} />

      {dirty && (
        <div className="savebar">
          <button className="btn" onClick={() => (setD(pick(state)), setDirty(false))}>
            ยกเลิก
          </button>
          <button className="btn-primary" onClick={save}>
            บันทึกการตั้งค่า
          </button>
        </div>
      )}
    </div>
  );
}

type SectionProps = { d: Draft; update: (f: (x: Draft) => void) => void };

function PeopleSection({ d, update }: SectionProps) {
  const [name, setName] = useState('');
  return (
    <section className="card">
      <h3>เภสัช ({d.people.filter((p) => p.active).length} คนที่อยู่เวร)</h3>
      <div className="people-list">
        {d.people.map((p, i) => (
          <div key={p.id} className={'person-row' + (p.active ? '' : ' inactive')}>
            <input
              type="color"
              value={p.color}
              onChange={(e) => update((x) => (x.people[i].color = e.target.value))}
              aria-label="สี"
            />
            <input
              className="name-input"
              value={p.name}
              style={{ background: p.color, color: textOn(p.color) }}
              onChange={(e) => update((x) => (x.people[i].name = e.target.value))}
              aria-label="ชื่อเล่น"
            />
            <input
              className="fullname-input"
              value={p.fullName ?? ''}
              placeholder="ชื่อจริง (ใช้ตอนพิมพ์)"
              onChange={(e) => update((x) => (x.people[i].fullName = e.target.value))}
              aria-label="ชื่อจริง"
            />
            <label className="check small">
              <input
                type="checkbox"
                checked={p.canDouble}
                onChange={(e) => update((x) => (x.people[i].canDouble = e.target.checked))}
              />
              บ่ายต่อดึกได้
            </label>
            <label className="check small">
              <input
                type="checkbox"
                checked={p.active}
                onChange={(e) => update((x) => (x.people[i].active = e.target.checked))}
              />
              อยู่เวร
            </label>
            <button
              className="btn-ghost"
              aria-label="ลบ"
              onClick={() => {
                if (confirm(`ลบ ${p.name} ออกจากระบบ? (ถ้าแค่พักงาน ให้เอาเครื่องหมาย "อยู่เวร" ออกแทน)`)) {
                  update((x) => x.people.splice(i, 1));
                }
              }}
            >
              🗑
            </button>
          </div>
        ))}
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          const hue = Math.floor(Math.random() * 360);
          update((x) =>
            x.people.push({ id: newId().slice(0, 10), name: name.trim(), color: hslHex(hue), canDouble: false, active: true }),
          );
          setName('');
        }}
      >
        <input placeholder="ชื่อเภสัชคนใหม่" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" type="submit">
          + เพิ่ม
        </button>
      </form>
      <p className="muted small">ช่องแรก = ชื่อเล่น (ใช้ตอนจัดเวร) · ช่องที่สอง = ชื่อจริง (ใช้ตอนพิมพ์) · คนใหม่จะถูกต่อท้ายทุกคิว</p>
    </section>
  );
}

function HolidaySection({ d, update }: SectionProps) {
  const years = [...new Set(d.holidays.map((h) => h.date.slice(0, 4)))].sort();
  const [year, setYear] = useState(years[0] ?? String(new Date().getFullYear()));
  const [h, setH] = useState<Holiday>({ date: '', name: '' });
  const list = d.holidays
    .map((x, i) => ({ ...x, i }))
    .filter((x) => x.date.startsWith(year))
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section className="card">
      <h3>วันหยุดราชการ</h3>
      <p className="muted small">
        ใส่ตามประกาศรัฐบาล รวมวันชดเชยและวันหยุดพิเศษ (วันหยุดทางพุทธศาสนายังไม่ได้ใส่ให้) · ติ๊กปีใหม่/สงกรานต์เพื่อใช้แพทเทิร์นเทศกาล
      </p>
      <div className="seg">
        {[...new Set([...years, year])].sort().map((y) => (
          <button key={y} className={y === year ? 'seg-on' : ''} onClick={() => setYear(y)}>
            {Number(y) + 543}
          </button>
        ))}
        <button onClick={() => setYear(String(Number(year) + 1))}>+</button>
      </div>
      <ul className="hol-list">
        {list.map((x) => (
          <li key={x.i}>
            <span className="nowrap">{thaiDateLabel(x.date)}</span>
            <span className="grow">{x.name}</span>
            <select
              value={x.festival ?? ''}
              onChange={(e) =>
                update((s) => {
                  const v = e.target.value as Holiday['festival'] | '';
                  if (v) s.holidays[x.i].festival = v;
                  else delete s.holidays[x.i].festival;
                })
              }
            >
              <option value="">ทั่วไป</option>
              <option value="newyear">ปีใหม่</option>
              <option value="songkran">สงกรานต์</option>
            </select>
            <button className="btn-ghost" onClick={() => update((s) => s.holidays.splice(x.i, 1))} aria-label="ลบ">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form
        className="row wrap"
        onSubmit={(e) => {
          e.preventDefault();
          if (!h.date || !h.name) return;
          update((s) => {
            s.holidays = s.holidays.filter((x) => x.date !== h.date);
            s.holidays.push(h.festival ? h : { date: h.date, name: h.name });
          });
          setYear(h.date.slice(0, 4));
          setH({ date: '', name: '' });
        }}
      >
        <input type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} />
        <input placeholder="ชื่อวันหยุด" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
        <select
          value={h.festival ?? ''}
          onChange={(e) => setH({ ...h, festival: (e.target.value || undefined) as Holiday['festival'] })}
        >
          <option value="">ทั่วไป</option>
          <option value="newyear">ปีใหม่</option>
          <option value="songkran">สงกรานต์</option>
        </select>
        <button className="btn" type="submit">
          + เพิ่ม
        </button>
      </form>
      {h.date && [0, 6].includes(weekday(h.date)) && <p className="muted small">วันนี้ตรงกับเสาร์/อาทิตย์ อย่าลืมเพิ่มวันชดเชย</p>}
    </section>
  );
}

function TemplateSection({ d, update }: SectionProps) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card">
      <h3>แพทเทิร์นวันหยุด</h3>
      <p className="muted small">
        แถวแรก = คืนก่อนวันหยุด (ใช้แค่บ่าย/ดึก) · ใส่ตัวอักษรแทนคน (A, B, C…) · ใส่ * ในช่องเสริม = ดึงจากคิวเวรเสริม ·
        ถ้ามีหลายแพทเทิร์นจำนวนวันเท่ากัน ปีใหม่จะเลือกที่ใช้คนราวครึ่งหนึ่ง สงกรานต์ใช้คนที่เหลือ
      </p>
      {d.templates.map((t, ti) => (
        <div key={t.id} className="tpl">
          <button className="tpl-head" onClick={() => setOpen(open === t.id ? null : t.id)}>
            <span>{t.label}</span>
            <span className="muted small">
              {TEMPLATE_KIND_LABEL[t.kind]} · {t.days} วัน {open === t.id ? '▲' : '▼'}
            </span>
          </button>
          {open === t.id && (
            <TemplateEditor
              t={t}
              onChange={(nt) => update((x) => (x.templates[ti] = nt))}
              onDelete={() => update((x) => x.templates.splice(ti, 1))}
            />
          )}
        </div>
      ))}
      <button
        className="btn"
        onClick={() => {
          const id = `t-${newId().slice(0, 6)}`;
          update((x) =>
            x.templates.push({ id, label: 'แพทเทิร์นใหม่', kind: 'adjacent', days: 1, rows: [['', '', '', 'A', 'B'], ['', '', '', '', '']] }),
          );
          setOpen(id);
        }}
      >
        + เพิ่มแพทเทิร์น
      </button>
    </section>
  );
}

function TemplateEditor({ t, onChange, onDelete }: { t: Template; onChange: (t: Template) => void; onDelete: () => void }) {
  const setRows = (rows: string[][]) => onChange({ ...t, rows, days: rows.length - 1 });
  return (
    <div className="tpl-body">
      <div className="row wrap">
        <input value={t.label} onChange={(e) => onChange({ ...t, label: e.target.value })} />
        <select value={t.kind} onChange={(e) => onChange({ ...t, kind: e.target.value as TemplateKind })}>
          {Object.entries(TEMPLATE_KIND_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <table className="tpl-grid">
        <thead>
          <tr>
            <th />
            {SLOTS.map((s) => (
              <th key={s}>{SLOT_LABEL[s]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, r) => (
            <tr key={r}>
              <th>{r === 0 ? 'คืนก่อน' : `วัน ${r}`}</th>
              {row.map((c, ci) => (
                <td key={ci}>
                  <input
                    value={c}
                    maxLength={2}
                    onChange={(e) => {
                      const rows = t.rows.map((x) => [...x]);
                      rows[r][ci] = e.target.value.toUpperCase().trim();
                      setRows(rows);
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="btn" onClick={() => setRows([...t.rows, ['', '', '', '', '']])}>
          + วัน
        </button>
        <button className="btn" disabled={t.rows.length <= 2} onClick={() => setRows(t.rows.slice(0, -1))}>
          − วัน
        </button>
        <span className="spacer" />
        <button className="btn-danger" onClick={() => confirm('ลบแพทเทิร์นนี้?') && onDelete()}>
          ลบ
        </button>
      </div>
    </div>
  );
}

function BackupSection({ state, commit }: Pick<Ctx, 'state' | 'commit'>) {
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bmshift-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as AppState;
      if (data.version !== 1 || !Array.isArray(data.people)) throw new Error('bad file');
      if (confirm('แทนที่ข้อมูลทั้งหมดด้วยไฟล์นี้?')) await commit(data);
    } catch {
      alert('ไฟล์ไม่ถูกต้อง');
    }
  };
  return (
    <section className="card">
      <h3>สำรองข้อมูล</h3>
      <div className="row wrap">
        <button className="btn" onClick={exportJson}>
          ⬇️ ดาวน์โหลดไฟล์สำรอง
        </button>
        <label className="btn">
          ⬆️ นำเข้าไฟล์
          <input type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </label>
        <button
          className="btn-danger"
          onClick={() => confirm('ล้างข้อมูลทั้งหมดและเริ่มจากข้อมูลตั้งต้น?') && commit(seedState())}
        >
          เริ่มใหม่จากข้อมูลตั้งต้น
        </button>
      </div>
    </section>
  );
}

function hslHex(h: number): string {
  const s = 0.55;
  const l = 0.7;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
