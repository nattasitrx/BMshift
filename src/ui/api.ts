import { DEFAULT_PAY_RATES } from '../engine/pay';
import { defaultFestivalGroup, NOV_NO_WEEKEND, seedState } from '../engine/seed';
import { withBaselines } from '../engine/swaps';
import type { AppState, ShiftRequest } from '../engine/types';

// ถ้าเปิดบน Netlify ข้อมูลอยู่ที่เซิร์ฟเวอร์ (ทุกคนเห็นตรงกัน)
// ถ้าไม่มีเซิร์ฟเวอร์ (เช่นตอนพัฒนา) จะเก็บในเครื่องนี้แทน
export type Mode = 'remote' | 'local';

export class ConflictError extends Error {}

const LS_STATE = 'bmshift:state';
const LS_REQ = 'bmshift:requests';

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore (private mode / storage full)
  }
}

export async function loadState(): Promise<{ mode: Mode; state: AppState; etag: string | null }> {
  try {
    const res = await fetch('/api/state');
    if (res.ok && res.headers.get('content-type')?.includes('json')) {
      const body = (await res.json()) as { state: AppState | null; etag: string | null };
      return { mode: 'remote', state: migrate(body.state ?? seedState()), etag: body.etag };
    }
  } catch {
    // fall through to local mode
  }
  return { mode: 'local', state: migrate(lsGet(LS_STATE, seedState())), etag: null };
}

/** เติมฟิลด์ใหม่ให้ข้อมูลที่บันทึกไว้ก่อนอัปเดต */
export function migrate(s: AppState): AppState {
  // พ.ย. 69 ที่นำเข้าจากรูป: เติมคิว "ไม่อยู่ ส-อา" (มด, แสง) ให้ข้อมูลที่บันทึกไว้ก่อนมีฟิลด์นี้
  const nov = s.months?.['2026-11'];
  const months =
    nov && !nov.noWeekend && nov.info?.some((i) => i.startsWith('นำเข้า'))
      ? { ...s.months, '2026-11': { ...nov, noWeekend: NOV_NO_WEEKEND } }
      : s.months;
  return withBaselines({
    ...s,
    months,
    festivals: s.festivals ?? [],
    festivalGroup: s.festivalGroup ?? defaultFestivalGroup(s.people.map((p) => p.id), s.queues?.festival),
    settings: { ...s.settings, payRates: s.settings.payRates ?? DEFAULT_PAY_RATES },
  });
}

export async function saveState(mode: Mode, state: AppState, etag: string | null): Promise<string | null> {
  if (mode === 'local') {
    lsSet(LS_STATE, state);
    return null;
  }
  const res = await fetch('/api/state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ state, etag }),
  });
  if (res.status === 409) throw new ConflictError('conflict');
  if (!res.ok) throw new Error(`บันทึกไม่สำเร็จ (${res.status})`);
  return ((await res.json()) as { etag: string }).etag;
}

export async function listRequests(mode: Mode, month: string): Promise<ShiftRequest[]> {
  if (mode === 'local') return lsGet<ShiftRequest[]>(LS_REQ, []).filter((r) => r.date.startsWith(month));
  const res = await fetch(`/api/requests?month=${month}`);
  if (!res.ok) throw new Error(`โหลดคำขอไม่สำเร็จ (${res.status})`);
  return ((await res.json()) as { requests: ShiftRequest[] }).requests;
}

export async function addRequest(mode: Mode, r: Omit<ShiftRequest, 'createdAt'>): Promise<ShiftRequest> {
  if (mode === 'local') {
    const item = { ...r, createdAt: new Date().toISOString() };
    lsSet(LS_REQ, [...lsGet<ShiftRequest[]>(LS_REQ, []), item]);
    return item;
  }
  const res = await fetch('/api/requests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(r),
  });
  if (!res.ok) throw new Error(`บันทึกคำขอไม่สำเร็จ (${res.status})`);
  return ((await res.json()) as { request: ShiftRequest }).request;
}

export async function deleteRequest(mode: Mode, r: ShiftRequest): Promise<void> {
  if (mode === 'local') {
    lsSet(LS_REQ, lsGet<ShiftRequest[]>(LS_REQ, []).filter((x) => x.id !== r.id));
    return;
  }
  const res = await fetch(`/api/requests?month=${r.date.slice(0, 7)}&id=${r.id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`ลบคำขอไม่สำเร็จ (${res.status})`);
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
