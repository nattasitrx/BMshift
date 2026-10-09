import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';

// ตลาดเวร: ประกาศ (p) และข้อเสนอ (o) เก็บแยกทีละรายการ หลายคนลงพร้อมกันได้ไม่ชนกัน
const MONTH = /^\d{4}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const SLOTS = ['O', 'I', 'S', 'PM', 'N', 'SMC'];

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const optDate = (v: unknown) => v === undefined || (typeof v === 'string' && DATE.test(v));
const optSlot = (v: unknown) => v === undefined || (typeof v === 'string' && SLOTS.includes(v));

function cleanPost(r: Record<string, unknown>) {
  const ok =
    typeof r.id === 'string' && ID.test(r.id) &&
    typeof r.month === 'string' && MONTH.test(r.month) &&
    ['sell', 'swap', 'buy'].includes(r.kind as string) &&
    typeof r.by === 'string' && ID.test(r.by) &&
    typeof r.date === 'string' && DATE.test(r.date) && r.date.startsWith(r.month as string) &&
    optSlot(r.slot) &&
    ['open', 'done', 'cancelled'].includes(r.status as string) &&
    (r.dealId === undefined || (typeof r.dealId === 'string' && ID.test(r.dealId)));
  if (!ok) return null;
  return {
    id: r.id, month: r.month, kind: r.kind, by: r.by, date: r.date, slot: r.slot,
    want: str(r.want, 200), note: str(r.note, 300), status: r.status, dealId: r.dealId,
    createdAt: str(r.createdAt, 40) ?? new Date().toISOString(),
    closedAt: str(r.closedAt, 40),
  };
}

function cleanOffer(r: Record<string, unknown>) {
  const ok =
    typeof r.id === 'string' && ID.test(r.id) &&
    typeof r.postId === 'string' && ID.test(r.postId) &&
    typeof r.month === 'string' && MONTH.test(r.month) &&
    typeof r.by === 'string' && ID.test(r.by) &&
    ['take', 'swap', 'give'].includes(r.kind as string) &&
    optDate(r.date) && optSlot(r.slot);
  if (!ok) return null;
  return {
    id: r.id, postId: r.postId, month: r.month, by: r.by, kind: r.kind, date: r.date, slot: r.slot,
    note: str(r.note, 300), createdAt: str(r.createdAt, 40) ?? new Date().toISOString(),
  };
}

export default async (req: Request) => {
  const store = getStore({ name: 'bmshift', consistency: 'strong' });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const month = url.searchParams.get('month') ?? '';
    if (!MONTH.test(month)) return Response.json({ error: 'invalid month' }, { status: 400 });
    const { blobs } = await store.list({ prefix: `mkt/${month}/` });
    const items = await Promise.all(blobs.map(async (b) => ({ key: b.key, v: await store.get(b.key, { type: 'json' }) })));
    return Response.json({
      posts: items.filter((x) => x.key.includes('/p/') && x.v).map((x) => x.v),
      offers: items.filter((x) => x.key.includes('/o/') && x.v).map((x) => x.v),
    });
  }

  if (req.method === 'POST') {
    const body = (await req.json()) as { type?: string; item?: Record<string, unknown> };
    if (!body.item) return Response.json({ error: 'invalid' }, { status: 400 });
    const item = body.type === 'post' ? cleanPost(body.item) : body.type === 'offer' ? cleanOffer(body.item) : null;
    if (!item) return Response.json({ error: 'invalid item' }, { status: 400 });
    await store.setJSON(`mkt/${item.month}/${body.type === 'post' ? 'p' : 'o'}/${item.id}`, item);
    return Response.json({ item });
  }

  if (req.method === 'DELETE') {
    const month = url.searchParams.get('month') ?? '';
    const type = url.searchParams.get('type');
    const id = url.searchParams.get('id') ?? '';
    if (!MONTH.test(month) || !ID.test(id) || (type !== 'post' && type !== 'offer')) {
      return Response.json({ error: 'invalid' }, { status: 400 });
    }
    await store.delete(`mkt/${month}/${type === 'post' ? 'p' : 'o'}/${id}`);
    return Response.json({ ok: true });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config: Config = { path: '/api/market' };
