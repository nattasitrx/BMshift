import { DEFAULT_PAY_RATES } from '../engine/pay';
import { defaultFestivalGroup, NOV_NO_WEEKEND, seedState } from '../engine/seed';
import type { MarketOffer, MarketPost } from '../engine/market';
import type { AppState, RequestAck, ShiftRequest } from '../engine/types';

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
  return {
    ...s,
    months,
    festivals: s.festivals ?? [],
    festivalGroup: s.festivalGroup ?? defaultFestivalGroup(s.people.map((p) => p.id), s.queues?.festival),
    settings: { ...s.settings, payRates: s.settings.payRates ?? DEFAULT_PAY_RATES },
  };
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

// ---------- ตลาดเวร ----------
const LS_MKT = 'bmshift:market';
type MarketStore = { posts: MarketPost[]; offers: MarketOffer[] };

export async function listMarket(mode: Mode, month: string): Promise<MarketStore> {
  if (mode === 'local') {
    const all = lsGet<MarketStore>(LS_MKT, { posts: [], offers: [] });
    return { posts: all.posts.filter((p) => p.month === month), offers: all.offers.filter((o) => o.month === month) };
  }
  const res = await fetch(`/api/market?month=${month}`);
  if (!res.ok) throw new Error(`โหลดตลาดเวรไม่สำเร็จ (${res.status})`);
  return (await res.json()) as MarketStore;
}

export async function saveMarket(mode: Mode, type: 'post' | 'offer', item: MarketPost | MarketOffer): Promise<void> {
  if (mode === 'local') {
    const all = lsGet<MarketStore>(LS_MKT, { posts: [], offers: [] });
    const key = type === 'post' ? 'posts' : 'offers';
    const list = (all[key] as (MarketPost | MarketOffer)[]).filter((x) => x.id !== item.id);
    lsSet(LS_MKT, { ...all, [key]: [...list, item] });
    return;
  }
  const res = await fetch('/api/market', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, item }),
  });
  if (!res.ok) throw new Error(`บันทึกไม่สำเร็จ (${res.status})`);
}

export async function deleteMarket(mode: Mode, type: 'post' | 'offer', month: string, id: string): Promise<void> {
  if (mode === 'local') {
    const all = lsGet<MarketStore>(LS_MKT, { posts: [], offers: [] });
    lsSet(LS_MKT, {
      posts: type === 'post' ? all.posts.filter((x) => x.id !== id) : all.posts,
      offers: type === 'offer' ? all.offers.filter((x) => x.id !== id) : all.offers,
    });
    return;
  }
  const res = await fetch(`/api/market?month=${month}&type=${type}&id=${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`ลบไม่สำเร็จ (${res.status})`);
}

// ---------- ยืนยันลงข้อมูลแล้ว ----------
const LS_ACK = 'bmshift:acks';

export async function listAcks(mode: Mode, month: string): Promise<RequestAck[]> {
  if (mode === 'local') return lsGet<RequestAck[]>(LS_ACK, []).filter((a) => a.month === month);
  const res = await fetch(`/api/acks?month=${month}`);
  if (!res.ok) throw new Error(`โหลดการยืนยันไม่สำเร็จ (${res.status})`);
  return ((await res.json()) as { acks: RequestAck[] }).acks;
}

/** kind = null คือยกเลิกการยืนยัน */
export async function setAck(mode: Mode, month: string, personId: string, kind: RequestAck['kind'] | null): Promise<void> {
  if (mode === 'local') {
    const rest = lsGet<RequestAck[]>(LS_ACK, []).filter((a) => !(a.month === month && a.personId === personId));
    lsSet(LS_ACK, kind ? [...rest, { month, personId, kind, at: new Date().toISOString() }] : rest);
    return;
  }
  const res = kind
    ? await fetch('/api/acks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ month, personId, kind }),
      })
    : await fetch(`/api/acks?month=${month}&personId=${personId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`บันทึกการยืนยันไม่สำเร็จ (${res.status})`);
}
