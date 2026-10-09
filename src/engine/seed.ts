import type { AppState, DayAssign, MonthRecord, Person, Queues, Template } from './types';

const P = (id: string, name: string, color: string, canDouble = false): Person => ({
  id,
  name,
  color,
  canDouble,
  active: true,
});

export const SEED_PEOPLE: Person[] = [
  P('pu', 'ปู', '#bf9000'),
  P('la', 'หล้า', '#a9d18e'),
  P('pa', 'ภา', '#9b59d0'),
  P('mod', 'มด', '#dae3f3', true),
  P('eve', 'อีฟ', '#fce4d6'),
  P('saeng', 'แสง', '#4472c4', true),
  P('pae', 'เป้', '#ffe699'),
  P('alex', 'อาเล็ก', '#e2efda'),
  P('ae', 'เอ้', '#b4c6e7'),
  P('mouse', 'เม้าส์', '#70ad47'),
  P('poy', 'ปอย', '#f4b084'),
  P('prae', 'แพร', '#d0cece'),
  P('pak', 'ปั๊ก', '#c55a11'),
  P('paeng', 'แป้ง', '#ffc000'),
];

// ลำดับจากสมุด (หลังจัด พ.ย. 69) — คิวเวรเสริม/SMC/เทศกาล ยังเป็นค่าชั่วคราว ให้แก้ในหน้าคิว
export const SEED_QUEUES: Queues = {
  adjacent: ['ae', 'alex', 'prae', 'mouse', 'eve', 'poy', 'mod', 'la', 'pae', 'pak', 'paeng', 'pu', 'saeng', 'pa'],
  midweek: ['pae', 'saeng', 'pu', 'pa', 'mod', 'eve', 'poy', 'pak', 'prae', 'alex', 'ae', 'paeng', 'mouse', 'la'],
  festival: ['pu', 'la', 'pa', 'mod', 'eve', 'saeng', 'pae', 'alex', 'ae', 'mouse', 'poy', 'prae', 'pak', 'paeng'],
  twoWeekend: ['ae', 'pae', 'paeng', 'la', 'pa', 'mouse', 'eve', 'poy', 'prae', 'alex', 'pak', 'saeng', 'pu', 'mod'],
  noWeekend: ['ae', 'alex', 'poy', 'pu', 'eve', 'mouse', 'pae', 'paeng', 'la', 'pa', 'prae', 'pak', 'mod', 'saeng'],
  extra: ['ae', 'alex', 'poy', 'eve', 'mouse', 'pak', 'pa', 'mod', 'saeng', 'pu', 'prae', 'pae', 'paeng', 'la'],
  smc: ['ae', 'alex', 'poy', 'mouse', 'prae', 'paeng', 'pu', 'saeng', 'eve', 'pa', 'pak', 'la', 'mod', 'pae'],
  totalExtra: ['mod', 'eve', 'poy', 'ae', 'pae', 'paeng', 'mouse', 'la', 'pak', 'pu', 'saeng', 'pa', 'alex', 'prae'],
  nightExtra: ['pa', 'poy', 'alex', 'prae', 'paeng', 'eve', 'mouse', 'pak', 'la', 'saeng', 'ae', 'pae', 'pu', 'mod'],
};

const EVE3 = ['', '', '', 'A', 'B'];
const EVEC = ['', '', '', 'A', 'C'];

// แถวละ [OPD, IPD, เสริม, บ่าย, ดึก] แถวแรก = คืนก่อนวันหยุด
export const SEED_TEMPLATES: Template[] = [
  {
    id: 'weekend',
    label: 'เสาร์–อาทิตย์ปกติ (3 คน + เสริม)',
    kind: 'weekend',
    days: 2,
    rows: [EVE3, ['C', 'A', '*', 'C', 'A'], ['B', 'C', '*', 'B', 'C']],
  },
  {
    id: 'adj3',
    label: 'หยุดติดกัน 3 วัน ใช้ 4 คน',
    kind: 'adjacent',
    days: 3,
    rows: [EVE3, ['C', 'D', 'A', 'C', 'A'], ['B', 'C', 'D', 'B', 'C'], ['D', 'A', 'B', 'D', 'B']],
  },
  {
    id: 'adj4',
    label: 'หยุดติดกัน 4 วัน ใช้ 5 คน',
    kind: 'adjacent',
    days: 4,
    rows: [EVEC, ['B', 'A', 'D', 'B', 'A'], ['C', 'D', 'B', 'C', 'B'], ['E', 'C', 'A', 'E', 'A'], ['D', 'E', 'B', 'D', 'E']],
  },
  {
    id: 'ny4-6',
    label: 'ปีใหม่ 4 วัน ใช้ 6 คน',
    kind: 'newyear',
    days: 4,
    rows: [EVEC, ['B', 'A', 'D', 'B', 'A'], ['E', 'D', 'B', 'E', 'B'], ['C', 'F', 'E', 'C', 'E'], ['D', 'F', 'C', 'D', 'F']],
  },
  {
    id: 'ny4-7',
    label: 'ปีใหม่ 4 วัน ใช้ 7 คน',
    kind: 'newyear',
    days: 4,
    rows: [EVEC, ['B', 'A', 'D', 'B', 'A'], ['C', 'D', 'B', 'C', 'B'], ['E', 'F', 'G', 'E', 'D'], ['F', 'G', 'E', 'F', 'G']],
  },
  {
    id: 'sk5-7',
    label: 'สงกรานต์ 5 วัน ใช้ 7 คน',
    kind: 'songkran',
    days: 5,
    rows: [
      EVEC,
      ['B', 'A', 'F', 'B', 'A'],
      ['C', 'F', 'B', 'C', 'B'],
      ['E', 'C', 'F', 'E', 'F'],
      ['D', 'G', 'E', 'D', 'E'],
      ['G', 'A', 'D', 'G', 'D'],
    ],
  },
  {
    id: 'sk5-8',
    label: 'สงกรานต์ 5 วัน ใช้ 8 คน',
    kind: 'songkran',
    days: 5,
    rows: [
      EVEC,
      ['B', 'A', 'F', 'B', 'A'],
      ['C', 'F', 'B', 'C', 'B'],
      ['E', 'H', 'F', 'E', 'H'],
      ['D', 'G', 'E', 'D', 'E'],
      ['G', 'H', 'D', 'G', 'D'],
    ],
  },
  {
    id: 'sk6-8',
    label: 'สงกรานต์ 6 วัน ใช้ 8 คน',
    kind: 'songkran',
    days: 6,
    rows: [
      EVEC,
      ['B', 'A', 'F', 'B', 'A'],
      ['C', 'F', 'B', 'C', 'B'],
      ['F', 'C', 'H', 'F', 'G'],
      ['E', 'H', 'A', 'E', 'H'],
      ['D', 'G', 'E', 'D', 'E'],
      ['G', 'H', 'D', 'G', 'D'],
    ],
  },
  {
    id: 'mid1',
    label: 'หยุดไม่ติดกัน 1 วัน ใช้ 4 คน',
    kind: 'midweek',
    days: 1,
    rows: [EVE3, ['C', 'A', 'D', 'C', 'D']],
  },
  {
    id: 'mid2',
    label: 'หยุดไม่ติดกัน 2 วัน ใช้ 4 คน',
    kind: 'midweek',
    days: 2,
    rows: [EVE3, ['C', 'D', 'A', 'C', 'A'], ['B', 'C', 'D', 'B', 'D']],
  },
];

// วันหยุดราชการวันที่ตายตัว + วันชดเชย (วันหยุดทางพุทธศาสนาและวันหยุดพิเศษต้องเพิ่มเองตามประกาศ)
export const SEED_HOLIDAYS: AppState['holidays'] = [
  { date: '2026-10-13', name: 'วันนวมินทรมหาราช' },
  { date: '2026-10-23', name: 'วันปิยมหาราช' },
  { date: '2026-12-05', name: 'วันพ่อแห่งชาติ' },
  { date: '2026-12-07', name: 'ชดเชยวันพ่อแห่งชาติ' },
  { date: '2026-12-10', name: 'วันรัฐธรรมนูญ' },
  { date: '2026-12-31', name: 'วันสิ้นปี', festival: 'newyear' },
  { date: '2027-01-01', name: 'วันขึ้นปีใหม่', festival: 'newyear' },
  { date: '2027-04-06', name: 'วันจักรี' },
  { date: '2027-04-13', name: 'วันสงกรานต์', festival: 'songkran' },
  { date: '2027-04-14', name: 'วันสงกรานต์', festival: 'songkran' },
  { date: '2027-04-15', name: 'วันสงกรานต์', festival: 'songkran' },
  { date: '2027-05-04', name: 'วันฉัตรมงคล' },
  { date: '2027-06-03', name: 'วันเฉลิมพระชนมพรรษาพระราชินี' },
  { date: '2027-07-28', name: 'วันเฉลิมพระชนมพรรษา ร.10' },
  { date: '2027-08-12', name: 'วันแม่แห่งชาติ' },
  { date: '2027-10-13', name: 'วันนวมินทรมหาราช' },
  { date: '2027-10-23', name: 'วันปิยมหาราช' },
  { date: '2027-10-25', name: 'ชดเชยวันปิยมหาราช' },
  { date: '2027-12-05', name: 'วันพ่อแห่งชาติ' },
  { date: '2027-12-06', name: 'ชดเชยวันพ่อแห่งชาติ' },
  { date: '2027-12-10', name: 'วันรัฐธรรมนูญ' },
  { date: '2027-12-31', name: 'วันสิ้นปี', festival: 'newyear' },
];

// ตารางเวร พ.ย. 69 จากรูป (รวมที่แก้ด้วยปากกาแดงแล้ว) — ดึกวันที่ 18 อ่านไม่ออก เว้นไว้
const NOV: [number, DayAssign][] = [
  [1, { O: 'pu', I: 'la', S: 'pa', PM: 'pu', N: 'pak' }],
  [2, { PM: 'mod', N: 'mod', SMC: 'eve' }],
  [3, { PM: 'alex', N: 'ae' }],
  [4, { PM: 'mouse', N: 'eve', SMC: 'pa' }],
  [5, { PM: 'pa', N: 'pae' }],
  [6, { PM: 'mouse', N: 'paeng' }],
  [7, { O: 'ae', I: 'mouse', S: 'pu', PM: 'ae', N: 'pu' }],
  [8, { O: 'la', I: 'ae', S: 'prae', PM: 'la', N: 'ae' }],
  [9, { PM: 'mouse', N: 'poy' }],
  [10, { PM: 'prae', N: 'pa' }],
  [11, { PM: 'saeng', N: 'saeng', SMC: 'pak' }],
  [12, { PM: 'mod', N: 'mod' }],
  [13, { PM: 'pa', N: 'eve' }],
  [14, { O: 'pak', I: 'pa', S: 'pae', PM: 'pak', N: 'pa' }],
  [15, { O: 'eve', I: 'pak', S: 'pae', PM: 'eve', N: 'pak' }],
  [16, { PM: 'alex', N: 'prae', SMC: 'la' }],
  [17, { PM: 'la', N: 'paeng' }],
  [18, { PM: 'pak', SMC: 'mod' }],
  [19, { PM: 'pa', N: 'alex' }],
  [20, { PM: 'prae', N: 'pu' }],
  [21, { O: 'pae', I: 'prae', S: 'paeng', PM: 'pae', N: 'prae' }],
  [22, { O: 'pu', I: 'pae', S: 'paeng', PM: 'pu', N: 'pae' }],
  [23, { PM: 'saeng', N: 'saeng' }],
  [24, { PM: 'prae', N: 'ae' }],
  [25, { PM: 'mod', N: 'mod', SMC: 'pae' }],
  [26, { PM: 'saeng', N: 'pu' }],
  [27, { PM: 'alex', N: 'paeng' }],
  [28, { O: 'poy', I: 'alex', S: 'la', PM: 'poy', N: 'alex' }],
  [29, { O: 'paeng', I: 'poy', S: 'la', PM: 'paeng', N: 'poy' }],
  [30, { PM: 'la', N: 'eve' }],
];

const imported = (blocks: MonthRecord['blocks'], roles: MonthRecord['weekendRoles'], smcDays: string[]): MonthRecord => ({
  generatedAt: '2026-10-09T00:00:00.000Z',
  queuesBefore: SEED_QUEUES,
  queuesAfter: SEED_QUEUES,
  blocks,
  smcDays,
  weekendRoles: roles,
  info: ['นำเข้าจากรูปตารางเวร (ไม่ได้จัดด้วยระบบ) — โปรดตรวจความถูกต้อง'],
  warnings: [],
});

const wk = (start: string, end: string, eve: string, A: string, B: string, C: string, extraId: string) => ({
  start,
  end,
  eve,
  kind: 'weekend' as const,
  templateId: 'weekend',
  people: { A, B, C },
  extraId,
});

export function seedState(): AppState {
  const days: AppState['days'] = {};
  for (const [d, a] of NOV) days[`2026-11-${String(d).padStart(2, '0')}`] = a;
  return {
    version: 1,
    people: SEED_PEOPLE,
    queues: SEED_QUEUES,
    holidays: SEED_HOLIDAYS,
    templates: SEED_TEMPLATES,
    settings: { festivalCountsAsWeekend: false, templateOverride: {} },
    days,
    months: {
      '2026-10': imported([{ ...wk('2026-10-31', '2026-11-01', '2026-10-30', '', 'pu', 'la', 'pa'), people: { B: 'pu', C: 'la' } }], {}, []),
      '2026-11': imported(
        [
          wk('2026-11-07', '2026-11-08', '2026-11-06', 'mouse', 'la', 'ae', 'pu'),
          wk('2026-11-14', '2026-11-15', '2026-11-13', 'pa', 'eve', 'pak', 'pae'),
          wk('2026-11-21', '2026-11-22', '2026-11-20', 'prae', 'pu', 'pae', 'paeng'),
          wk('2026-11-28', '2026-11-29', '2026-11-27', 'alex', 'paeng', 'poy', 'la'),
        ],
        {
          mouse: ['A'], pa: ['A'], prae: ['A'], alex: ['A'],
          la: ['B'], eve: ['B'], pu: ['B'], paeng: ['B'],
          ae: ['C'], pak: ['C'], pae: ['C'], poy: ['C'],
        },
        ['2026-11-02', '2026-11-04', '2026-11-11', '2026-11-16', '2026-11-18', '2026-11-25'],
      ),
    },
  };
}
