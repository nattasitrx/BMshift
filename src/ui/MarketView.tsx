import { useCallback, useEffect, useState } from 'react';
import { daysInMonth, thaiDateLabel, thaiMonthLabel } from '../engine/dates';
import { withHistory } from '../engine/history';
import {
  applyDeal,
  OFFER_LABEL,
  offerKindsFor,
  POST_ICON,
  POST_LABEL,
  shiftsOf,
  shiftText,
  type MarketOffer,
  type MarketPost,
  type MarketSlot,
  type OfferKind,
  type PostKind,
} from '../engine/market';
import { SLOT_LABEL } from '../engine/types';
import { deleteMarket, listMarket, newId, saveMarket } from './api';
import type { Ctx } from './App';
import { Chip, getMe, saveMe } from './common';

const SLOT_CHOICES: MarketSlot[] = ['O', 'I', 'S', 'PM', 'N', 'SMC'];
const shiftKey = (date: string, slot: string) => `${date}|${slot}`;

export function MarketView({ state, mode, commit, requests, month }: Ctx) {
  const [me, setMeState] = useState(getMe);
  const [posts, setPosts] = useState<MarketPost[]>([]);
  const [offers, setOffers] = useState<MarketOffer[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [composing, setComposing] = useState(false);
  const people = new Map(state.people.map((p) => [p.id, p]));
  const name = (id: string) => people.get(id)?.name ?? id;
  const active = state.people.filter((p) => p.active);

  const load = useCallback(async () => {
    try {
      const r = await listMarket(mode, month);
      setPosts(r.posts);
      setOffers(r.offers);
      setErr('');
    } catch (e) {
      setErr(String(e));
    }
  }, [mode, month]);
  useEffect(() => {
    load();
  }, [load]);

  const setMe = (id: string) => {
    setMeState(id);
    saveMe(id);
  };

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
      await load();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(false);
    }
  };

  const agree = (post: MarketPost, offer: MarketOffer) =>
    run(async () => {
      const deal = applyDeal(state, post, offer, requests);
      if (deal.error || !deal.state) {
        alert(`ตกลงไม่ได้: ${deal.error}`);
        return;
      }
      const warn = deal.issues.length
        ? `\n\n⚠️ หลังแลกจะผิดกฎ:\n${deal.issues.map((i) => `• ${thaiDateLabel(i.date)} ${i.message}`).join('\n')}`
        : '';
      if (!confirm(`ตกลงดีลนี้? ระบบจะแก้ตารางให้\n\n${deal.summary}${warn}`)) return;
      const ok = await commit(withHistory(state, deal.state, post.month, name(me), `ตลาดเวร: ${deal.summary}`));
      if (!ok) return;
      await saveMarket(mode, 'post', { ...post, status: 'done', dealId: offer.id, closedAt: new Date().toISOString() });
    });

  const open = posts.filter((p) => p.status === 'open').sort((a, b) => a.date.localeCompare(b.date));
  const closed = posts
    .filter((p) => p.status !== 'open')
    .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
  // เวรที่ประกาศไว้แล้ว ไม่ให้ประกาศซ้ำ
  const listed = new Set(open.filter((p) => p.slot && p.kind !== 'buy').map((p) => shiftKey(p.date, p.slot!)));

  return (
    <div>
      <section className="card">
        <h3>ตลาดเวร {thaiMonthLabel(month)}</h3>
        <label className="field">
          ฉันคือ
          <select value={me} onChange={(e) => setMe(e.target.value)}>
            <option value="">— เลือกชื่อ —</option>
            {active.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted small">
          🏷️ ขายเวร = หาคนรับเวรของเราไป · 🔄 หาแลก = เอาเวรของเราแลกกับวันอื่น · 🛒 รับซื้อ = อยากได้เวรเพิ่ม · คนที่สนใจกด
          "เสนอ" แล้วเจ้าของประกาศกด "ตกลง" ระบบจะแก้ตารางให้และบันทึกในประวัติ
        </p>
        <div className="row wrap">
          <button className="btn-primary" disabled={!me} onClick={() => setComposing(!composing)}>
            {composing ? 'ปิด' : '+ ลงประกาศ'}
          </button>
          <button className="btn" onClick={load} disabled={busy}>
            ↻ รีเฟรช
          </button>
        </div>
        {err && <p className="req-off small">{err}</p>}
      </section>

      {composing && me && (
        <NewPost
          me={me}
          month={month}
          state={state}
          listed={listed}
          onSubmit={(p) =>
            run(async () => {
              await saveMarket(mode, 'post', p);
              setComposing(false);
            })
          }
        />
      )}

      <h3 className="sub-h">เปิดอยู่ ({open.length})</h3>
      {open.length === 0 && <p className="muted">ยังไม่มีประกาศ</p>}
      {open.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          offers={offers.filter((o) => o.postId === post.id)}
          me={me}
          state={state}
          busy={busy}
          name={name}
          onOffer={(o) => run(() => saveMarket(mode, 'offer', o))}
          onDeleteOffer={(o) => run(() => deleteMarket(mode, 'offer', o.month, o.id))}
          onCancel={() =>
            confirm('ยกเลิกประกาศนี้?') &&
            run(() => saveMarket(mode, 'post', { ...post, status: 'cancelled', closedAt: new Date().toISOString() }))
          }
          onAgree={(o) => agree(post, o)}
        />
      ))}

      {closed.length > 0 && (
        <section className="card">
          <h3>ปิดแล้ว ({closed.length})</h3>
          <ul className="req-list">
            {closed.map((p) => {
              const deal = offers.find((o) => o.id === p.dealId);
              return (
                <li key={p.id}>
                  <span>{POST_ICON[p.kind]}</span>
                  <span className="grow">
                    <b>{name(p.by)}</b> {POST_LABEL[p.kind]} {p.slot || p.kind === 'buy' ? shiftText(p.date, p.slot) : ''}
                    {p.status === 'done' && deal ? (
                      <span className="req-want">
                        {' '}
                        ✓ ตกลงกับ {name(deal.by)}
                        {deal.date && deal.slot ? ` (${shiftText(deal.date, deal.slot)})` : ''}
                      </span>
                    ) : (
                      <span className="muted"> · ยกเลิก</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function NewPost({
  me,
  month,
  state,
  listed,
  onSubmit,
}: {
  me: string;
  month: string;
  state: Ctx['state'];
  listed: Set<string>;
  onSubmit: (p: MarketPost) => void;
}) {
  const [kind, setKind] = useState<PostKind>('sell');
  const mine = shiftsOf(state, me, month).filter((s) => !listed.has(shiftKey(s.date, s.slot)));
  const [shift, setShift] = useState('');
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState<MarketSlot | ''>('');
  const [want, setWant] = useState('');
  const [note, setNote] = useState('');
  const days = daysInMonth(month);
  const canSubmit = kind === 'buy' ? !!date : !!shift;

  return (
    <section className="card">
      <h3>ลงประกาศ</h3>
      <div className="seg">
        {(Object.keys(POST_LABEL) as PostKind[]).map((k) => (
          <button key={k} className={kind === k ? 'seg-on' : ''} onClick={() => setKind(k)}>
            {POST_ICON[k]} {POST_LABEL[k]}
          </button>
        ))}
      </div>
      {kind !== 'buy' ? (
        <label className="field col">
          เวรของฉันที่จะ{kind === 'sell' ? 'ขาย' : 'แลก'}
          <select value={shift} onChange={(e) => setShift(e.target.value)}>
            <option value="">— เลือกเวร —</option>
            {mine.map((s) => (
              <option key={shiftKey(s.date, s.slot)} value={shiftKey(s.date, s.slot)}>
                {shiftText(s.date, s.slot)}
              </option>
            ))}
          </select>
          {mine.length === 0 && <span className="muted small">ไม่มีเวรของคุณในเดือนนี้ (หรือประกาศไปหมดแล้ว)</span>}
        </label>
      ) : (
        <div className="row wrap">
          <label className="field col">
            วันที่อยากได้
            <select value={date} onChange={(e) => setDate(e.target.value)}>
              <option value="">— เลือกวัน —</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {thaiDateLabel(d)}
                </option>
              ))}
            </select>
          </label>
          <label className="field col">
            เวร
            <select value={slot} onChange={(e) => setSlot(e.target.value as MarketSlot | '')}>
              <option value="">เวรใดก็ได้</option>
              {SLOT_CHOICES.map((s) => (
                <option key={s} value={s}>
                  {SLOT_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {kind === 'swap' && (
        <label className="field col">
          อยากได้วันไหนแทน
          <input value={want} onChange={(e) => setWant(e.target.value)} placeholder="เช่น วันธรรมดาสัปดาห์ที่ 3, บ่ายวันไหนก็ได้" />
        </label>
      )}
      <label className="field col">
        หมายเหตุ
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="(ไม่บังคับ)" />
      </label>
      <button
        className="btn-primary wide"
        disabled={!canSubmit}
        onClick={() => {
          const [d, s] = kind === 'buy' ? [date, slot || undefined] : shift.split('|');
          onSubmit({
            id: newId(),
            month,
            kind,
            by: me,
            date: d,
            slot: (s || undefined) as MarketSlot | undefined,
            want: kind === 'swap' ? want || undefined : undefined,
            note: note || undefined,
            status: 'open',
            createdAt: new Date().toISOString(),
          });
        }}
      >
        ลงประกาศ
      </button>
    </section>
  );
}

function PostCard({
  post,
  offers,
  me,
  state,
  busy,
  name,
  onOffer,
  onDeleteOffer,
  onCancel,
  onAgree,
}: {
  post: MarketPost;
  offers: MarketOffer[];
  me: string;
  state: Ctx['state'];
  busy: boolean;
  name: (id: string) => string;
  onOffer: (o: MarketOffer) => void;
  onDeleteOffer: (o: MarketOffer) => void;
  onCancel: () => void;
  onAgree: (o: MarketOffer) => void;
}) {
  const kinds = offerKindsFor(post.kind);
  const [kind, setKind] = useState<OfferKind>(kinds[0]);
  const [shift, setShift] = useState('');
  const [note, setNote] = useState('');
  const mineShifts = shiftsOf(state, me, post.month).filter(
    (s) => post.kind !== 'buy' || s.date === post.date || !post.date,
  );
  const needsShift = kind === 'swap' || kind === 'give';
  const isOwner = me === post.by;
  const alreadyOffered = offers.some((o) => o.by === me);

  return (
    <section className={`card post post-${post.kind}`}>
      <div className="post-head">
        <span className="post-kind">
          {POST_ICON[post.kind]} {POST_LABEL[post.kind]}
        </span>
        <Chip person={state.people.find((p) => p.id === post.by)} small />
      </div>
      <div className="post-shift">{shiftText(post.date, post.slot)}</div>
      {post.want && <div className="small">อยากได้แทน: {post.want}</div>}
      {post.note && <div className="small muted">{post.note}</div>}

      {offers.length > 0 && (
        <ul className="offer-list">
          {offers.map((o) => (
            <li key={o.id}>
              <Chip person={state.people.find((p) => p.id === o.by)} small />
              <span className="grow small">
                {OFFER_LABEL[o.kind]}
                {o.date && o.slot ? ` ${shiftText(o.date, o.slot)}` : ''}
                {o.note ? ` · ${o.note}` : ''}
              </span>
              {isOwner && (
                <button className="btn-primary btn-sm" disabled={busy} onClick={() => onAgree(o)}>
                  ตกลง
                </button>
              )}
              {o.by === me && (
                <button className="btn-ghost" disabled={busy} onClick={() => onDeleteOffer(o)} aria-label="ถอนข้อเสนอ">
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {isOwner ? (
        <div className="row">
          <span className="muted small grow">{offers.length ? 'เลือกข้อเสนอแล้วกด "ตกลง"' : 'รอคนเสนอ'}</span>
          <button className="btn-danger btn-sm" disabled={busy} onClick={onCancel}>
            ยกเลิกประกาศ
          </button>
        </div>
      ) : me && !alreadyOffered ? (
        <div className="offer-form">
          <div className="seg seg-sm">
            {kinds.map((k) => (
              <button key={k} className={kind === k ? 'seg-on' : ''} onClick={() => setKind(k)}>
                {OFFER_LABEL[k]}
              </button>
            ))}
          </div>
          {needsShift && (
            <select value={shift} onChange={(e) => setShift(e.target.value)} aria-label="เวรของฉัน">
              <option value="">— เวรของฉัน —</option>
              {mineShifts.map((s) => (
                <option key={shiftKey(s.date, s.slot)} value={shiftKey(s.date, s.slot)}>
                  {shiftText(s.date, s.slot)}
                </option>
              ))}
            </select>
          )}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ)" />
          <button
            className="btn"
            disabled={busy || (needsShift && !shift)}
            onClick={() => {
              const [d, s] = shift ? shift.split('|') : [undefined, undefined];
              onOffer({
                id: newId(),
                postId: post.id,
                month: post.month,
                by: me,
                kind,
                date: needsShift ? d : undefined,
                slot: needsShift ? (s as MarketSlot) : undefined,
                note: note || undefined,
                createdAt: new Date().toISOString(),
              });
              setShift('');
              setNote('');
            }}
          >
            เสนอ
          </button>
        </div>
      ) : !me ? (
        <p className="muted small">เลือกชื่อด้านบนเพื่อเสนอ</p>
      ) : (
        <p className="muted small">คุณเสนอไปแล้ว รอเจ้าของประกาศตกลง</p>
      )}
    </section>
  );
}
