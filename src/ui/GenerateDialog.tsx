import { useState } from 'react';
import { thaiMonthLabel } from '../engine/dates';
import type { AppState, GenerateMode } from '../engine/types';
import { getMe, Modal, saveMe } from './common';

export type MonthAction = GenerateMode | 'clear' | 'undo';

export const ACTION_LABEL: Record<MonthAction, string> = {
  extra: 'จัดเฉพาะเวรเสริม',
  weekend: 'จัดเสาร์–อาทิตย์และวันหยุด',
  rest: 'จัดวันธรรมดา + SMC',
  all: 'จัดทั้งหมดใหม่',
  clear: 'ล้างทั้งเดือน',
  undo: 'ย้อนกลับการกดครั้งล่าสุด',
};

const ICON: Record<MonthAction, string> = { extra: '✳️', weekend: '📅', rest: '🗓️', all: '✨', clear: '🗑️', undo: '↩️' };

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function GenerateDialog({
  state,
  month,
  onClose,
  onRun,
}: {
  state: AppState;
  month: string;
  onClose: () => void;
  onRun: (action: MonthAction, byId: string) => Promise<void>;
}) {
  const [by, setBy] = useState(getMe);
  const [action, setAction] = useState<MonthAction | ''>('');
  const [busy, setBusy] = useState(false);
  const record = state.months[month];
  const done = new Set(record?.stages ?? (record ? ['extra', 'weekend', 'rest'] : []));
  const undo = state.undo?.[month];
  const later = Object.keys(state.months).filter((m) => m > month && !state.months[m].info.some((i) => i.startsWith('นำเข้า')));

  const desc: Record<MonthAction, string> = {
    extra: 'สุ่มเวรเสริมเสาร์–อาทิตย์จากคิว ไม่แตะเวรอื่น',
    weekend: `จัด A/B/C เสาร์–อาทิตย์และวันหยุดราชการ${done.has('extra') ? ' (เก็บเวรเสริมที่จัดไว้แล้ว)' : ' + เวรเสริม'} · วันธรรมดาจะถูกล้าง`,
    rest: `เติมบ่าย/ดึกวันธรรมดาและ SMC ให้ยอดเท่ากัน ไม่แตะเสาร์–อาทิตย์${done.has('weekend') ? '' : ' · ⚠️ ยังไม่ได้จัดเสาร์–อาทิตย์'}`,
    all: 'ล้างแล้วจัดทุกขั้นในครั้งเดียว',
    clear: 'ลบเวรทั้งหมดของเดือนนี้ และคืนคิวเหมือนยังไม่ได้จัด',
    undo: undo
      ? `กลับไปก่อน "${undo.action}" ของ ${undo.by} (${formatWhen(undo.at)}) · การแก้มือหลังจากนั้นจะหายด้วย`
      : '',
  };
  const options: MonthAction[] = ['extra', 'weekend', 'rest', 'all', ...(record ? (['clear'] as const) : []), ...(undo ? (['undo'] as const) : [])];

  const go = async () => {
    if (!by || !action) return;
    saveMe(by);
    setBusy(true);
    try {
      await onRun(action, by);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`จัดเวร ${thaiMonthLabel(month)}`} onClose={onClose}>
      <label className="field">
        ผู้จัดเวร
        <select value={by} onChange={(e) => setBy(e.target.value)}>
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
      <p className="muted small">ระบบจะบันทึกว่าใครกดจัดเวร และย้อนกลับได้ถ้ากดผิด</p>
      <div className="actions">
        {options.map((a) => (
          <label key={a} className={'action' + (action === a ? ' on' : '') + (a === 'clear' ? ' danger' : '')}>
            <input type="radio" name="action" checked={action === a} onChange={() => setAction(a)} />
            <span>
              <b>
                {ICON[a]} {ACTION_LABEL[a]}
                {(a === 'extra' || a === 'weekend' || a === 'rest') && done.has(a) && <span className="done"> ✓ จัดแล้ว</span>}
              </b>
              <span className="muted small">{desc[a]}</span>
            </span>
          </label>
        ))}
      </div>
      {later.length > 0 && (action === 'all' || action === 'weekend' || action === 'clear') && (
        <p className="small req-off">
          เดือนหลังจากนี้ ({later.map(thaiMonthLabel).join(', ')}) จัดไว้แล้ว ควรจัดใหม่ตามลำดับด้วย
        </p>
      )}
      <button className={action === 'clear' ? 'btn-danger wide' : 'btn-primary wide'} disabled={!by || !action || busy} onClick={go}>
        {busy ? 'กำลังทำ…' : !by ? 'เลือกชื่อผู้จัดเวรก่อน' : !action ? 'เลือกสิ่งที่จะทำ' : `ยืนยัน: ${ACTION_LABEL[action]}`}
      </button>
    </Modal>
  );
}
