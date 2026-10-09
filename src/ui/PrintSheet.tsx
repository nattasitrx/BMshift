import { holidayMap, isOffDay } from '../engine/blocks';
import { daysInMonth, thaiDayShort, thaiMonthLabel } from '../engine/dates';
import type { AppState } from '../engine/types';

// ตารางสำหรับพิมพ์ฉบับจริง: ใช้ชื่อจริง ไม่มีข้อมูลไม่ว่าง/ขออยู่
// และมีช่องว่างให้เจ้าพนักงานเขียนชื่อเอง (เช้า 4 ช่อง, บ่าย/ดึก/SMC อย่างละ 1 ช่อง)
const STAFF_MORNING = 4;

// ขนาดคอลัมน์ (มม.) บน A4 แนวนอน ขอบ 7 มม. — ใช้คำนวณย่อชื่อยาวให้อยู่บรรทัดเดียว ทั้งเดือนจะได้พอดีหน้าเดียว
const PAGE_MM = 297 - 14;
const DATE_MM = 24;
const BLANK_MM = 12;
const NAME_MM = (PAGE_MM - DATE_MM - (STAFF_MORNING + 3) * BLANK_MM) / 6;
const BASE_PT = 9;
const MIN_PT = 6.5;

let canvas: CanvasRenderingContext2D | null | undefined;
function fitPt(text: string, mm: number, base = BASE_PT): number {
  if (!text) return base;
  canvas ??= document.createElement('canvas').getContext('2d');
  if (!canvas) return base;
  canvas.font = `${base}pt Sarabun, sans-serif`;
  const avail = mm * 3.7795 - 8;
  const w = canvas.measureText(text).width;
  return w <= avail ? base : Math.max(MIN_PT, Math.floor((base * avail * 10) / w) / 10);
}

export function PrintSheet({ state, month }: { state: AppState; month: string }) {
  const hol = holidayMap(state.holidays);
  const people = new Map(state.people.map((p) => [p.id, p]));
  const name = (id?: string) => {
    if (!id) return '';
    const p = people.get(id);
    return p ? p.fullName?.trim() || p.name : '';
  };
  const cell = (id: string | undefined, na: boolean) => {
    const text = name(id);
    return (
      <td className={na ? 'na' : ''} style={text ? { fontSize: `${fitPt(text, NAME_MM)}pt` } : undefined}>
        {text}
      </td>
    );
  };
  const blanks = (n: number, na: boolean) =>
    Array.from({ length: n }, (_, k) => <td key={k} className={na ? 'blank na' : 'blank'} />);

  return (
    <div className="print-only print-sheet">
      <h1>ตารางเวรเภสัชกร ประจำเดือน{thaiMonthLabel(month)}</h1>
      <table>
        <colgroup>
          <col className="c-date" />
          <col className="c-name" />
          <col className="c-name" />
          {Array.from({ length: STAFF_MORNING }, (_, k) => (
            <col key={k} className="c-blank" />
          ))}
          <col className="c-name" />
          <col className="c-name" />
          <col className="c-blank" />
          <col className="c-name" />
          <col className="c-blank" />
          <col className="c-name" />
          <col className="c-blank" />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>วันที่</th>
            <th colSpan={2 + STAFF_MORNING}>เวรเช้า</th>
            <th rowSpan={2}>เสริม</th>
            <th colSpan={2}>บ่าย</th>
            <th colSpan={2}>ดึก</th>
            <th colSpan={2}>SMC</th>
          </tr>
          <tr>
            <th>OPD</th>
            <th>IPD</th>
            <th colSpan={STAFF_MORNING}>เจ้าพนักงาน</th>
            <th>เภสัชกร</th>
            <th>จพ.</th>
            <th>เภสัชกร</th>
            <th>จพ.</th>
            <th>เภสัชกร</th>
            <th>จพ.</th>
          </tr>
        </thead>
        <tbody>
          {daysInMonth(month).map((d) => {
            const a = state.days[d] ?? {};
            const off = isOffDay(d, hol);
            return (
              <tr key={d} className={off ? 'off' : ''}>
                <td className="date">
                  {Number(d.slice(8))} {thaiDayShort(d)}
                  {hol.has(d) && (
                    <div className="hol" style={{ fontSize: `${fitPt(hol.get(d)!.name, DATE_MM, 6.5)}pt` }}>
                      {hol.get(d)!.name}
                    </div>
                  )}
                </td>
                {cell(a.O, !off)}
                {cell(a.I, !off)}
                {blanks(STAFF_MORNING, !off)}
                {cell(a.S, !off)}
                {cell(a.PM, false)}
                {blanks(1, false)}
                {cell(a.N, false)}
                {blanks(1, false)}
                {cell(a.SMC, !a.SMC)}
                {blanks(1, !a.SMC)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
