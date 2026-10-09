import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';

// ติ๊กยืนยัน "ลงข้อมูลแล้ว / ไม่มีวันไม่ว่าง" เก็บแยกรายคน รายเดือน
const MONTH = /^\d{4}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async (req: Request) => {
  const store = getStore({ name: 'bmshift', consistency: 'strong' });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const month = url.searchParams.get('month') ?? '';
    if (!MONTH.test(month)) return Response.json({ error: 'invalid month' }, { status: 400 });
    const { blobs } = await store.list({ prefix: `ack/${month}/` });
    const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
    return Response.json({ acks: items.filter(Boolean) });
  }

  if (req.method === 'POST') {
    const r = (await req.json()) as Record<string, unknown>;
    const ok =
      typeof r.month === 'string' && MONTH.test(r.month) &&
      typeof r.personId === 'string' && ID.test(r.personId) &&
      (r.kind === 'done' || r.kind === 'none');
    if (!ok) return Response.json({ error: 'invalid ack' }, { status: 400 });
    const item = { month: r.month, personId: r.personId, kind: r.kind, at: new Date().toISOString() };
    await store.setJSON(`ack/${r.month}/${r.personId}`, item);
    return Response.json({ ack: item });
  }

  if (req.method === 'DELETE') {
    const month = url.searchParams.get('month') ?? '';
    const personId = url.searchParams.get('personId') ?? '';
    if (!MONTH.test(month) || !ID.test(personId)) return Response.json({ error: 'invalid' }, { status: 400 });
    await store.delete(`ack/${month}/${personId}`);
    return Response.json({ ok: true });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config: Config = { path: '/api/acks' };
