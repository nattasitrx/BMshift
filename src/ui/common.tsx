import type { ReactNode } from 'react';
import type { Person } from '../engine/types';

export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#111';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#111' : '#fff';
}

export function Chip({ person, small }: { person?: Person; small?: boolean }) {
  if (!person) return null;
  return (
    <span
      className={small ? 'chip chip-sm' : 'chip'}
      style={{ background: person.color, color: textOn(person.color) }}
    >
      {person.name}
    </span>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="btn-ghost" onClick={onClose} aria-label="ปิด">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
