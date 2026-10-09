import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';

// คำขอ "ไม่ว่าง / ขออยู่" เก็บแยกทีละรายการ หลายคนกรอกพร้อมกันได้โดยไม่ชนกัน
const MONTH = /^\d{4}-\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export default async (req: Request) => {
  const store = getStore({ name: 'bmshift', consistency: 'strong' });
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const month = url.searchParams.get('month') ?? '';
    if (!MONTH.test(month)) return Response.json({ error: 'invalid month' }, { status: 400 });
    const { blobs } = await store.list({ prefix: `req/${month}/` });
    const items = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
    return Response.json({ requests: items.filter(Boolean) });
  }

  if (req.method === 'POST') {
    const r = (await req.json()) as Record<string, unknown>;
    const ok =
      typeof r.id === 'string' && ID.test(r.id) &&
      typeof r.date === 'string' && DATE.test(r.date) &&
      typeof r.personId === 'string' && ID.test(r.personId) &&
      (r.type === 'off' || r.type === 'want');
    if (!ok) return Response.json({ error: 'invalid request' }, { status: 400 });
    const item = {
      id: r.id,
      date: r.date,
      personId: r.personId,
      type: r.type,
      note: typeof r.note === 'string' ? r.note.slice(0, 200) : undefined,
      by: typeof r.by === 'string' ? r.by.slice(0, 60) : undefined,
      createdAt: new Date().toISOString(),
    };
    await store.setJSON(`req/${(r.date as string).slice(0, 7)}/${r.id}`, item);
    return Response.json({ request: item });
  }

  if (req.method === 'DELETE') {
    const month = url.searchParams.get('month') ?? '';
    const id = url.searchParams.get('id') ?? '';
    if (!MONTH.test(month) || !ID.test(id)) return Response.json({ error: 'invalid' }, { status: 400 });
    await store.delete(`req/${month}/${id}`);
    return Response.json({ ok: true });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config: Config = { path: '/api/requests' };
