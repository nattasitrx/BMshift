import { useCallback, useEffect, useRef, useState } from 'react';
import { shiftMonth, thaiMonthLabel, toISO } from '../engine/dates';
import type { AppState, ShiftRequest } from '../engine/types';
import { ConflictError, listRequests, loadState, saveState, type Mode } from './api';
import { QueuesView } from './QueuesView';
import { RequestsView } from './RequestsView';
import { ScheduleView } from './ScheduleView';
import { SettingsView } from './SettingsView';

type Tab = 'schedule' | 'requests' | 'queues' | 'settings';
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'schedule', label: 'ตารางเวร', icon: '📅' },
  { key: 'requests', label: 'แจ้งวัน', icon: '✋' },
  { key: 'queues', label: 'คิว', icon: '🔁' },
  { key: 'settings', label: 'ตั้งค่า', icon: '⚙️' },
];

export interface Ctx {
  state: AppState;
  mode: Mode;
  commit: (next: AppState) => Promise<boolean>;
  requests: ShiftRequest[];
  reloadRequests: () => Promise<void>;
  month: string;
}

export function App() {
  const [mode, setMode] = useState<Mode>('local');
  const [state, setState] = useState<AppState | null>(null);
  const etag = useRef<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>('schedule');
  const [month, setMonth] = useState(() => shiftMonth(toISO(new Date()).slice(0, 7), 1));
  const [requests, setRequests] = useState<ShiftRequest[]>([]);

  const reload = useCallback(async () => {
    const r = await loadState();
    setMode(r.mode);
    setState(r.state);
    etag.current = r.etag;
  }, []);

  useEffect(() => {
    reload().catch((e) => setError(String(e)));
  }, [reload]);

  const reloadRequests = useCallback(async () => {
    try {
      setRequests(await listRequests(mode, month));
    } catch (e) {
      setError(String(e));
    }
  }, [mode, month]);

  const loaded = state !== null;
  useEffect(() => {
    if (loaded) reloadRequests();
  }, [loaded, reloadRequests]);

  const commit = useCallback(
    async (next: AppState) => {
      setSaving(true);
      setState(next);
      try {
        etag.current = await saveState(mode, next, etag.current);
        setError('');
        return true;
      } catch (e) {
        if (e instanceof ConflictError) {
          setError('มีคนอื่นแก้ไขพร้อมกัน ระบบโหลดข้อมูลล่าสุดให้แล้ว กรุณาทำรายการอีกครั้ง');
          await reload();
        } else {
          setError(String(e));
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [mode, reload],
  );

  if (!state) return <div className="loading">กำลังโหลด…</div>;

  const ctx: Ctx = { state, mode, commit, requests, reloadRequests, month };

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">จัดเวรเภสัช</div>
        <div className="month-nav">
          <button className="btn-ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="เดือนก่อน">
            ‹
          </button>
          <span className="month-label">{thaiMonthLabel(month)}</span>
          <button className="btn-ghost" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="เดือนถัดไป">
            ›
          </button>
        </div>
        <div className="status">{saving ? 'กำลังบันทึก…' : mode === 'local' ? 'ออฟไลน์' : ''}</div>
      </header>
      {mode === 'local' && (
        <div className="banner no-print">
          โหมดทดลอง: ข้อมูลเก็บในเครื่องนี้เท่านั้น (ยังไม่ได้เชื่อมเซิร์ฟเวอร์ คนอื่นจะไม่เห็น)
        </div>
      )}
      {error && (
        <div className="banner banner-err no-print" onClick={() => setError('')}>
          {error}
        </div>
      )}
      <main className="content">
        {tab === 'schedule' && <ScheduleView {...ctx} />}
        {tab === 'requests' && <RequestsView {...ctx} />}
        {tab === 'queues' && <QueuesView {...ctx} />}
        {tab === 'settings' && <SettingsView {...ctx} />}
      </main>
      <nav className="tabbar no-print">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'tab active' : 'tab'} onClick={() => setTab(t.key)}>
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
