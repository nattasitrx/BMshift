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
  /** ชื่อเล่น ใช้ในหน้าจัดเวร */
  name: string;
  /** ชื่อจริง ใช้ตอนพิมพ์ (พิมพ์เฉพาะชื่อ ไม่มีคำนำหน้า/นามสกุล; ว่าง = ใช้ชื่อเล่น) */
  fullName?: string;
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
  festival: { label: 'ปีใหม่ / สงกรานต์', hint: 'ไม่ใช้แล้ว — เลือกกลุ่มในแท็บเทศกาล' },
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
  /** ระบบเติมให้อัตโนมัติ */
  auto?: boolean;
  /** ยังต้องตรวจกับประกาศทางการ (เช่น วันพระที่คำนวณ หรือวันชดเชยต่อกันหลายวัน) */
  pending?: boolean;
}

export type DayAssign = Partial<Record<Slot | 'SMC', string>> & { note?: string };

/** คำขอระบุเวร: ทั้งวัน / เช้า / บ่าย / ดึก */
export type RequestSlot = 'day' | 'M' | 'PM' | 'N';

export interface ShiftRequest {
  id: string;
  date: string;
  personId: string;
  type: 'off' | 'want';
  /** ไม่ระบุ = ทั้งวัน */
  slot?: RequestSlot;
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

/** ปีใหม่/สงกรานต์ จัดแยกล่วงหน้า แล้วตอนจัดรายเดือนจะนำมาหักออกจากยอดเวร */
export interface FestivalRecord extends BlockRecord {
  kind: 'newyear' | 'songkran';
  arrangedAt: string;
}

export type FestivalKind = 'newyear' | 'songkran';

export type WeekendRole = 'A' | 'B' | 'C';

/** ขั้นการจัดเวร: วันหยุดราชการ → เสริม → เสาร์–อาทิตย์ → วันธรรมดา+SMC */
export type Stage = 'holiday' | 'extra' | 'weekend' | 'rest';
export type GenerateMode = Stage | 'all';

export interface MonthRecord {
  generatedAt: string;
  /** ขั้นที่จัดแล้ว (ข้อมูลเก่าที่ไม่มีฟิลด์นี้ = จัดครบทุกขั้น) */
  stages?: Stage[];
  /** วันหยุดที่ใช้ตอนจัด ('YYYY-MM-DD' หรือ 'YYYY-MM-DD:newyear') ใช้เตือนเมื่อวันหยุดเปลี่ยนภายหลัง */
  holidaysUsed?: string[];
  /** สรุปแยกตามขั้น */
  notes?: Partial<Record<Stage, { info: string[]; warnings: string[] }>>;
  queuesBefore: Queues;
  queuesAfter: Queues;
  blocks: BlockRecord[];
  smcDays: string[];
  weekendRoles: Record<string, WeekendRole[]>;
  /** ใครไม่ต้องอยู่ ส-อา / อยู่ 2 รอบ ในเดือนนี้ (สำหรับหน้าสรุป) */
  noWeekend?: string[];
  twoWeekend?: string[];
  /** ใครได้ +1 เวรรวม / +1 ดึก ในเดือนนี้ (คิวเวรรวมเกิน/ดึกเกิน) */
  totalPlus?: string[];
  nightPlus?: string[];
  /** สรุปว่าระบบตัดสินใจอะไรจากคิว เช่น ใครไม่อยู่ ส-อา */
  info: string[];
  warnings: string[];
}

export interface PayRate {
  /** เริ่มใช้ตั้งแต่เดือนนี้ 'YYYY-MM' */
  from: string;
  /** บาทต่อเวร */
  amount: number;
}

export interface Settings {
  /** คนที่อยู่ปีใหม่/สงกรานต์ในเดือนนั้น นับว่าอยู่เสาร์–อาทิตย์แล้ว */
  festivalCountsAsWeekend: boolean;
  /** ค่าเวร (ใช้อัตราล่าสุดที่เริ่มก่อนหรือในเดือนนั้น) */
  payRates?: PayRate[];
  /** ใบเวรน้อยนับเวรเสริม / SMC เป็นค่าเวรด้วยไหม */
  payCountExtra?: boolean;
  payCountSmc?: boolean;
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
  festivals: FestivalRecord[];
  /** ใครอยู่ปีใหม่ ใครอยู่สงกรานต์ (เลือกเองในแท็บเทศกาล) */
  festivalGroup: Record<string, FestivalKind>;
  /** วันหยุดที่ระบบเติมให้แต่มีคนลบออก (จะไม่เสนอซ้ำ) */
  holidayDismissed?: string[];
  /** ประวัติว่าใครกดจัด/ล้าง/ย้อนกลับ แต่ละเดือน */
  monthLog?: Record<string, LogEntry[]>;
  /** สำเนาก่อนการกดครั้งล่าสุดของแต่ละเดือน (สำหรับปุ่มย้อนกลับ) */
  undo?: Record<string, UndoSnapshot>;
  days: Record<string, DayAssign>;
}

export interface LogEntry {
  at: string;
  by: string;
  action: string;
}

export interface UndoSnapshot extends LogEntry {
  days: Record<string, DayAssign | null>;
  record: MonthRecord | null;
  queues: Queues;
}
