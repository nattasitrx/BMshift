import { getStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';

// ข้อมูลหลักทั้งหมด (คน คิว วันหยุด แพทเทิร์น ตารางเวร) เก็บเป็น JSON ก้อนเดียว
// ใช้ ETag กันคนสองคนบันทึกทับกันโดยไม่รู้ตัว
export default async (req: Request) => {
  const store = getStore({ name: 'bmshift', consistency: 'strong' });

  if (req.method === 'GET') {
    const r = await store.getWithMetadata('state', { type: 'json' });
    return Response.json({ state: r?.data ?? null, etag: r?.etag ?? null });
  }

  if (req.method === 'PUT') {
    const body = (await req.json()) as { state?: unknown; etag?: string | null };
    if (!body.state || typeof body.state !== 'object') {
      return Response.json({ error: 'invalid state' }, { status: 400 });
    }
    const res = body.etag
      ? await store.setJSON('state', body.state, { onlyIfMatch: body.etag })
      : await store.setJSON('state', body.state, { onlyIfNew: true });
    if (!res.modified) return Response.json({ error: 'conflict' }, { status: 409 });
    return Response.json({ etag: res.etag });
  }

  return new Response('Method not allowed', { status: 405 });
};

export const config: Config = { path: '/api/state' };
