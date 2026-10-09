import { useState } from 'react';
import { thaiDateLabel, thaiMonthLabel } from '../engine/dates';
import { swapBalances, swapPairs, swapsOf, type SwapItem } from '../engine/swaps';
import { SLOT_LABEL, type AppState } from '../engine/types';
import { Chip } from './common';

// สรุปฝาก/ยืมเวร: ช่องที่คนอยู่จริงไม่ใช่คนที่ระบบจัดไว้

export const swapText = (it: SwapItem) => `${SLOT_LABEL[it.slot]} ${thaiDateLabel(it.date)}`;

export function SwapView({ state, month }: { state: AppState; month: string }) {
  const [range, setRange] = useState<'month' | 'all'>('month');
  const months = range === 'month' ? [month] : Object.keys(state.months).filter((m) => m <= month);
  const items = swapsOf(state, months);
  const balances = swapBalances(items).sort((a, b) => b.gave - b.took - (a.gave - a.took));
  const pairs = swapPairs(items);
  const people = new Map(state.people.map((p) => [p.id, p]));
  const name = (id: string) => people.get(id)?.name ?? id;

  return (
    <section className="card">
      <div className="row wrap">
        <h3 style={{ margin: 0 }}>ฝาก/ยืมเวร</h3>
        <span className="spacer" />
        <div className="seg seg-sm">
          <button className={range === 'month' ? 'seg-on' : ''} onClick={() => setRange('month')}>
            {thaiMonthLabel(month)}
          </button>
          <button className={range === 'all' ? 'seg-on' : ''} onClick={() => setRange('all')}>
            สะสมทั้งหมด
          </button>
        </div>
      </div>
      <p className="muted small">
        นับจากช่องที่คนอยู่จริงไม่ตรงกับที่ระบบจัด · "ฝาก" = ให้คนอื่นอยู่แทน · "อยู่แทน" = อยู่เวรของคนอื่น · แพทเทิร์นและคิวยังนับตามที่ระบบจัด
      </p>
      {items.length === 0 ? (
        <p className="muted">ไม่มีการฝาก/ยืมเวร</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="summary">
              <thead>
                <tr>
                  <th>ชื่อ</th>
                  <th>ฝาก</th>
                  <th>อยู่แทน</th>
                  <th>ค้าง</th>
                </tr>
              </thead>
              <tbody>
                {balances.map((b) => {
                  const net = b.gave - b.took;
                  return (
                    <tr key={b.id}>
                      <td>
                        <Chip person={people.get(b.id)} small />
                      </td>
                      <td>{b.gave}</td>
                      <td>{b.took}</td>
                      <td className={net > 0 ? 'hi' : net < 0 ? 'lo' : ''}>
                        {net > 0 ? `ติดคืน ${net}` : net < 0 ? `รอรับคืน ${-net}` : 'หักลบแล้ว'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h3 className="sub-h">รายคู่</h3>
          <ul className="pair-list">
            {pairs.map((p) => {
              const net = p.aToB.length - p.bToA.length;
              return (
                <li key={`${p.a}|${p.b}`}>
                  {p.aToB.length > 0 && (
                    <div>
                      <b>{name(p.a)}</b> ฝาก <b>{name(p.b)}</b> {p.aToB.length} เวร:{' '}
                      <span className="muted">{p.aToB.map(swapText).join(', ')}</span>
                    </div>
                  )}
                  {p.bToA.length > 0 && (
                    <div>
                      <b>{name(p.b)}</b> ฝาก <b>{name(p.a)}</b> {p.bToA.length} เวร:{' '}
                      <span className="muted">{p.bToA.map(swapText).join(', ')}</span>
                    </div>
                  )}
                  <div className="small">
                    {net === 0
                      ? '→ หักลบกันแล้ว'
                      : net > 0
                        ? `→ ${name(p.a)} ติดเวร ${name(p.b)} ${net} เวร`
                        : `→ ${name(p.b)} ติดเวร ${name(p.a)} ${-net} เวร`}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
