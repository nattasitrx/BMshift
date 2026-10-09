import { holidayMap, isOffDay } from '../engine/blocks';
import { daysInMonth, thaiDayShort, thaiMonthLabel } from '../engine/dates';
import { printName } from '../engine/names';
import type { AppState } from '../engine/types';

// ตารางสำหรับพิมพ์ฉบับจริง (A4 แนวตั้ง หน้าเดียว): ใช้ชื่อจริง (ไม่มีคำนำหน้า/นามสกุล) ไม่มีข้อมูลไม่ว่าง/ขออยู่
// SMC ไม่มีคอลัมน์แยก — วันที่มี SMC จะแบ่งครึ่งช่องบ่าย (ซ้าย = บ่าย, ขวา = SMC)

// ขนาดคอลัมน์ (มม.) บน A4 แนวตั้ง ขอบ 7 มม. — ใช้ย่อชื่อยาวให้อยู่บรรทัดเดียว
const PAGE_MM = 210 - 14;
const DATE_MM = 24;
const PM_MM = 52;
const NAME_MM = (PAGE_MM - DATE_MM - PM_MM) / 4;
const BASE_PT = 10;
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
    return p ? printName(p) : '';
  };
  const sized = (text: string, mm: number) => (text ? { fontSize: `${fitPt(text, mm)}pt` } : undefined);
  const cell = (id: string | undefined, na: boolean) => {
    const text = name(id);
    return (
      <td className={na ? 'na' : ''} style={sized(text, NAME_MM)}>
        {text}
      </td>
    );
  };

  return (
    <div className="print-only print-sheet">
      <h1>ตารางเวรเภสัชกร ประจำเดือน{thaiMonthLabel(month)}</h1>
      <table>
        <colgroup>
          <col style={{ width: `${DATE_MM}mm` }} />
          <col />
          <col />
          <col />
          <col style={{ width: `${PM_MM}mm` }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>วันที่</th>
            <th colSpan={2}>เวรเช้า</th>
            <th rowSpan={2}>เสริม</th>
            <th rowSpan={2}>บ่าย</th>
            <th rowSpan={2}>ดึก</th>
          </tr>
          <tr>
            <th>OPD</th>
            <th>IPD</th>
          </tr>
        </thead>
        <tbody>
          {daysInMonth(month).map((d) => {
            const a = state.days[d] ?? {};
            const off = isOffDay(d, hol);
            const pm = name(a.PM);
            const smc = name(a.SMC);
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
                {cell(a.S, !off)}
                {smc ? (
                  <td className="split">
                    <div>
                      <span style={sized(pm, PM_MM / 2)}>{pm}</span>
                      <span style={sized(smc, PM_MM / 2 - 7)}>
                        <small>SMC</small> {smc}
                      </span>
                    </div>
                  </td>
                ) : (
                  <td style={sized(pm, PM_MM)}>{pm}</td>
                )}
                {cell(a.N, false)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
