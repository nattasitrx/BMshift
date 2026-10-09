// ชื่อสำหรับพิมพ์: เอาเฉพาะชื่อจริง ตัดคำนำหน้า (ภก./ภญ./เภสัชกร ฯลฯ) และนามสกุลออก

const PREFIXES = [
  'เภสัชกรหญิง',
  'เภสัชกร',
  'ภญ.',
  'ภก.',
  'ภญ',
  'ภก',
  'นางสาว',
  'น.ส.',
  'นาง',
  'นาย',
  'ดร.',
];

export function firstNameOnly(full: string): string {
  let s = full.trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const p of PREFIXES) {
      if (s.startsWith(p)) {
        s = s.slice(p.length).trim();
        changed = true;
      }
    }
  }
  return s.split(/\s+/)[0] ?? '';
}

/** ชื่อที่ใช้ตอนพิมพ์ (ไม่มีชื่อจริง = ใช้ชื่อเล่น) */
export function printName(p: { name: string; fullName?: string }): string {
  return (p.fullName && firstNameOnly(p.fullName)) || p.name;
}
