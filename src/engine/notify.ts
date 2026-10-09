import { thaiDateLabel, thaiMonthLabel } from './dates';
import type { AppState, RequestAck, ShiftRequest } from './types';

export const ACK_LABEL: Record<RequestAck['kind'], string> = {
  done: 'ลงข้อมูลแล้ว',
  none: 'ไม่มีวันไม่ว่าง',
};

export interface AckStatus {
  done: string[];
  none: string[];
  /** ยังไม่ยืนยัน (personId) */
  pending: string[];
}

/** ใครยืนยันแล้ว / ยังไม่ยืนยัน (เฉพาะคนที่ยังทำงานอยู่) */
export function ackStatus(state: AppState, acks: RequestAck[]): AckStatus {
  const byPerson = new Map(acks.map((a) => [a.personId, a.kind]));
  const out: AckStatus = { done: [], none: [], pending: [] };
  for (const p of state.people) {
    if (!p.active) continue;
    const k = byPerson.get(p.id);
    (k ? out[k] : out.pending).push(p.id);
  }
  return out;
}

/** จำนวนวันจากวันนี้ถึงวันครบกำหนด (ติดลบ = เลยกำหนด) */
export function daysLeft(due: string, today: string): number {
  return Math.round((Date.parse(due) - Date.parse(today)) / 86400000);
}

/**
 * ข้อความสำหรับส่งเข้ากลุ่ม LINE
 * open = ประกาศรับข้อมูล, remind = เตือนคนที่ยังไม่ยืนยัน
 */
export function callMessage(
  state: AppState,
  month: string,
  acks: RequestAck[],
  requests: ShiftRequest[],
  link: string,
  kind: 'open' | 'remind',
): string {
  const call = state.calls?.[month];
  const names = new Map(state.people.map((p) => [p.id, p.name]));
  const due = call ? `ภายใน ${thaiDateLabel(call.due)}` : '';
  const lines: string[] = [];
  if (kind === 'open') {
    lines.push(`📅 จัดเวรเภสัช ${thaiMonthLabel(month)}`);
    lines.push(`กรุณาลง "ไม่ว่าง / ขออยู่" ในแอป${due ? ' ' + due : ''}`);
    lines.push('ลงเสร็จแล้ว หรือไม่มีวันไม่ว่าง กดติ๊กยืนยันในแอปด้วย 🙏');
  } else {
    const { pending } = ackStatus(state, acks);
    lines.push(`🔔 เตือนลงข้อมูลเวร ${thaiMonthLabel(month)}${due ? ` (${due})` : ''}`);
    if (pending.length === 0) {
      lines.push('✅ ทุกคนยืนยันครบแล้ว ขอบคุณ');
    } else {
      const withReq = new Set(requests.map((r) => r.personId));
      lines.push(`ยังไม่ได้ติ๊กยืนยัน ${pending.length} คน:`);
      lines.push(pending.map((id) => names.get(id) + (withReq.has(id) ? ' (ลงแล้ว รอติ๊ก)' : '')).join(', '));
    }
  }
  lines.push(`👉 ${link}`);
  if (call?.by) lines.push(`— ${call.by} (ผู้จัดเวร)`);
  return lines.join('\n');
}

/** เปิดหน้าแชร์ของ LINE พร้อมข้อความ (เลือกกลุ่มแล้วกดส่ง) */
export function lineShareUrl(text: string): string {
  return `https://line.me/R/share?text=${encodeURIComponent(text)}`;
}
