// ช่องเวรในแต่ละวัน: เช้า OPD, เช้า IPD, เสริม, บ่าย, ดึก
export type Slot = 'O' | 'I' | 'S' | 'PM' | 'N';
export const SLOTS: Slot[] = ['O', 'I', 'S', 'PM', 'N'];
export const SLOT_LABEL: Record<Slot | 'SMC', string> = {
  O: 'OPD',
  I: 'IPD',
  S: 'เสริม',
  PM: 'บ่าย',
  N: 'ดึก',
  SMC: 'SMC',
};

export interface Person {
  id: string;
  name: string;
  color: string;
  /** อยู่บ่ายต่อดึกในวันเดียวกันได้ ระบบจะพยายามจัดให้คู่กัน */
  canDouble: boolean;
  active: boolean;
}

export type QueueKey =
  | 'adjacent'
  | 'midweek'
  | 'festival'
  | 'twoWeekend'
  | 'noWeekend'
  | 'extra'
  | 'smc'
  | 'totalExtra'
  | 'nightExtra';

export type Queues = Record<QueueKey, string[]>;

export const QUEUE_INFO: Record<QueueKey, { label: string; hint: string }> = {
  adjacent: { label: 'หยุดติดกัน', hint: 'วันหยุดนักขัตฤกษ์ที่ติดเสาร์–อาทิตย์ (รวมจันทร์/ศุกร์)' },
  midweek: { label: 'หยุดไม่ติดกัน', hint: 'วันหยุดกลางสัปดาห์ที่ไม่ติดเสาร์–อาทิตย์' },
  festival: { label: 'ปีใหม่ / สงกรานต์', hint: 'ปีใหม่ใช้คนต้นคิว สงกรานต์ใช้คนที่เหลือ ทุกคนได้อยู่ 1 เทศกาลต่อปี' },
  twoWeekend: { label: '2 wk (อยู่ ส-อา 2 รอบ)', hint: 'ใช้เมื่อคนไม่พอกับจำนวนเสาร์–อาทิตย์' },
  noWeekend: { label: 'ไม่อยู่ ส-อา', hint: 'ใช้เมื่อคนเกินจำนวนเสาร์–อาทิตย์' },
  extra: { label: 'เวรเสริม', hint: 'เสาร์–อาทิตย์ปกติ คนละ 1 สุดสัปดาห์' },
  smc: { label: 'SMC', hint: 'จันทร์ที่ 1, 3 ของเดือน และทุกวันพุธ' },
  totalExtra: { label: 'เวรรวมเกิน', hint: 'ใครได้เวรรวม +1 เมื่อหารไม่ลงตัว' },
  nightExtra: { label: 'ดึกเกิน', hint: 'ใครได้ดึก +1 เมื่อหารไม่ลงตัว' },
};

export type TemplateKind = 'weekend' | 'adjacent' | 'midweek' | 'newyear' | 'songkran';

export const TEMPLATE_KIND_LABEL: Record<TemplateKind, string> = {
  weekend: 'เสาร์–อาทิตย์ปกติ',
  adjacent: 'หยุดติดกัน',
  midweek: 'หยุดไม่ติดกัน',
  newyear: 'ปีใหม่',
  songkran: 'สงกรานต์',
};

/**
 * แพทเทิร์น: rows[0] คือคืนก่อนวันหยุด (ใช้เฉพาะบ่าย/ดึก) ต่อด้วยวันหยุดทีละแถว
 * แต่ละแถวเรียง [O, I, S, PM, N] เป็นตัวอักษรคน ('' = ว่าง, '*' = ดึงจากคิวเวรเสริม)
 */
export interface Template {
  id: string;
  label: string;
  kind: TemplateKind;
  days: number;
  rows: string[][];
}

export interface Holiday {
  date: string;
  name: string;
  festival?: 'newyear' | 'songkran';
}

export type DayAssign = Partial<Record<Slot | 'SMC', string>> & { note?: string };

export interface ShiftRequest {
  id: string;
  date: string;
  personId: string;
  type: 'off' | 'want';
  note?: string;
  by?: string;
  createdAt: string;
}

export type BlockKind = TemplateKind;

export interface BlockRecord {
  start: string;
  end: string;
  eve: string;
  kind: BlockKind;
  templateId: string;
  /** ตัวอักษรในแพทเทิร์น -> personId */
  people: Record<string, string>;
  /** เวรเสริมจากคิว (เฉพาะเสาร์–อาทิตย์ปกติ) */
  extraId?: string;
}

export type WeekendRole = 'A' | 'B' | 'C';

export interface MonthRecord {
  generatedAt: string;
  queuesBefore: Queues;
  queuesAfter: Queues;
  blocks: BlockRecord[];
  smcDays: string[];
  weekendRoles: Record<string, WeekendRole[]>;
  /** สรุปว่าระบบตัดสินใจอะไรจากคิว เช่น ใครไม่อยู่ ส-อา */
  info: string[];
  warnings: string[];
}

export interface Settings {
  /** คนที่อยู่ปีใหม่/สงกรานต์ในเดือนนั้น นับว่าอยู่เสาร์–อาทิตย์แล้ว */
  festivalCountsAsWeekend: boolean;
  /** บังคับแพทเทิร์นของช่วงวันหยุด key = วันแรกของช่วง */
  templateOverride: Record<string, string>;
}

export interface AppState {
  version: 1;
  people: Person[];
  queues: Queues;
  holidays: Holiday[];
  templates: Template[];
  settings: Settings;
  months: Record<string, MonthRecord>;
  days: Record<string, DayAssign>;
}
