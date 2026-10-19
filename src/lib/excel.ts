import ExcelJS from 'exceljs';
import { dateLabel, hoursOf, levelOf, slotHours, slotKey, validKeys, type Availability, type ShiftEvent } from './schedule';

// 匯出給老師用的 Excel。之後臨時換班、請假都直接在 Excel 上改，所以統計用公式算，改了會自動更新。
//
//   班表      和老師原本的格式一樣（列是時段、欄是日期）。點格子有下拉選單，只列出那格有空的人；
//            也可以直接打字。還沒排的格子是黃色，沒人有空的格子先填「—」。最右邊一欄是每格的時數，可以改。
//            有自動排班草稿（draft）時，格子先填好草稿的名字，下拉選單照樣可以換人。
//   有空名單   每格有誰有空，顏色越深人越多。
//   統計      每個人已排幾格、幾小時（公式），以及系統裡填的有空時數。

const FONT = { name: 'Microsoft JhengHei', size: 12 };
const NONE = '—';
const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
const border = { top: thin, left: thin, bottom: thin, right: thin };
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const HEADER_FILL = fill('FFF3F3F7');

// 數量色階（亮色模式），和網頁上的熱度圖一樣
const SEQ = ['FFF3F3F7', 'FFB8B3CF', 'FF9991BD', 'FF796EA5', 'FF5A4F81', 'FF39344D'];

const slotLabel = (s: { start: string; end: string }) => `${s.start}~${s.end}`;

export async function exportWorkbook(event: ShiftEvent, people: Availability[], draft?: Map<string, string>) {
  const buf = await buildWorkbook(event, people, draft);
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  a.download = `${event.title || '排班'}_班表_${stamp}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** draft：slotKey → 名字（見 autoschedule.ts），有的話班表格子先填好 */
export async function buildWorkbook(event: ShiftEvent, people: Availability[], draft?: Map<string, string>) {
  const wb = new ExcelJS.Workbook();
  wb.creator = '展覽排班系統';
  wb.created = new Date();

  const { dates, slots } = event;
  const valid = validKeys(event);
  const names = people.filter((p) => p.slots.some((k) => valid.has(k))).map((p) => p.name);
  const availableAt = new Map<string, string[]>();
  for (const p of people) for (const k of p.slots) if (valid.has(k)) availableAt.set(k, [...(availableAt.get(k) ?? []), p.name]);

  const firstRow = 2;
  const lastRow = firstRow + slots.length - 1;
  const firstCol = 2;
  const lastCol = firstCol + dates.length - 1;
  const hoursCol = lastCol + 1;
  const colLetter = (c: number) => columnLetter(c);
  const gridRange = `$${colLetter(firstCol)}$${firstRow}:$${colLetter(lastCol)}$${lastRow}`;

  // ── 班表 ──
  const ws = wb.addWorksheet('班表', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  ws.getColumn(1).width = 15;
  for (let c = firstCol; c <= lastCol; c++) ws.getColumn(c).width = 12;
  ws.getColumn(hoursCol).width = 10;

  const head = ws.getRow(1);
  head.getCell(1).value = '時段';
  dates.forEach((d, i) => (head.getCell(firstCol + i).value = dateLabel(d)));
  head.getCell(hoursCol).value = '每格時數';
  head.height = 22;

  slots.forEach((s, si) => {
    const row = ws.getRow(firstRow + si);
    row.height = 22;
    row.getCell(1).value = slotLabel(s);
    dates.forEach((d, di) => {
      const cell = row.getCell(firstCol + di);
      const avail = availableAt.get(slotKey(d, s)) ?? [];
      if (avail.length === 0) {
        cell.value = NONE;
        cell.font = { ...FONT, color: { argb: 'FF8A8B8C' } };
        cell.fill = fill('FFF3F3F7');
      } else {
        cell.value = draft?.get(slotKey(d, s)) ?? null;
        const list = `"${avail.join(',')}"`;
        cell.dataValidation = {
          type: 'list',
          allowBlank: true,
          // 有空的人太多、超過 Excel 的 255 字限制時，改成列出所有人
          formulae: [list.length <= 255 ? list : `'統計'!$A$2:$A$${names.length + 1}`],
          showErrorMessage: false, // 也可以直接打不在清單上的名字
        };
      }
    });
    const h = row.getCell(hoursCol);
    h.value = Math.round(slotHours(s) * 100) / 100;
    h.font = { ...FONT, color: { argb: 'FF6C6C6D' } };
  });

  styleGrid(ws, 1, lastRow, 1, hoursCol);
  ws.addConditionalFormatting({
    ref: gridRange.replace(/\$/g, ''),
    rules: [
      {
        type: 'expression',
        priority: 1,
        formulae: [`LEN(TRIM(${colLetter(firstCol)}${firstRow}))=0`],
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFFF00' } } },
      },
    ],
  });

  const noteRow = lastRow + 2;
  [
    ...(draft ? ['・已填入的名字是系統自動排的草稿（盡量讓每個人的班連續、時數平均），可以直接修改。'] : []),
    '・點格子會出現下拉選單，只列出那一格有空的人；也可以直接打字。',
    '・黃色是還沒排的格子；「—」表示沒有人有空。',
    '・「每格時數」可以修改，「統計」工作表會跟著重新計算。',
  ].forEach((t, i) => {
    const c = ws.getCell(noteRow + i, 1);
    c.value = t;
    c.font = { ...FONT, size: 11, color: { argb: 'FF6C6C6D' } };
  });

  // ── 有空名單 ──
  const wa = wb.addWorksheet('有空名單', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  wa.getColumn(1).width = 15;
  for (let c = firstCol; c <= lastCol; c++) wa.getColumn(c).width = 16;
  const ah = wa.getRow(1);
  ah.getCell(1).value = '時段';
  dates.forEach((d, i) => (ah.getCell(firstCol + i).value = dateLabel(d)));
  slots.forEach((s, si) => {
    const row = wa.getRow(firstRow + si);
    row.getCell(1).value = slotLabel(s);
    let maxLines = 1;
    dates.forEach((d, di) => {
      const avail = availableAt.get(slotKey(d, s)) ?? [];
      const cell = row.getCell(firstCol + di);
      const level = levelOf(avail.length, names.length);
      cell.value = avail.length ? avail.join('\n') : NONE;
      cell.fill = fill(SEQ[level]);
      cell.font = { ...FONT, color: { argb: level >= 3 ? 'FFFFFFFF' : level === 0 ? 'FF8A8B8C' : 'FF303031' } };
      maxLines = Math.max(maxLines, avail.length);
    });
    row.height = Math.max(22, maxLines * 17 + 6);
  });
  styleGrid(wa, 1, lastRow, 1, lastCol);
  for (let r = firstRow; r <= lastRow; r++)
    for (let c = firstCol; c <= lastCol; c++)
      wa.getCell(r, c).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  const legend = wa.getCell(lastRow + 2, 1);
  legend.value = `顏色越深表示越多人有空（共 ${names.length} 人填寫）。`;
  legend.font = { ...FONT, size: 11, color: { argb: 'FF6C6C6D' } };

  // ── 統計 ──
  const st = wb.addWorksheet('統計', { views: [{ state: 'frozen', ySplit: 1 }] });
  st.columns = [
    { header: '姓名', width: 16 },
    { header: '已排格數', width: 12 },
    { header: '已排時數', width: 12 },
    { header: '有空格數', width: 12 },
    { header: '有空時數', width: 12 },
  ];
  const extraRows = 5; // 預留空白列，老師之後加人也有公式可用
  const hoursCell = (r: number) => `'班表'!$${colLetter(hoursCol)}$${r}`;
  const rowRange = (r: number) => `'班表'!$${colLetter(firstCol)}$${r}:$${colLetter(lastCol)}$${r}`;
  for (let i = 0; i < names.length + extraRows; i++) {
    const r = 2 + i;
    const row = st.getRow(r);
    const name = names[i];
    const p = people.find((x) => x.name === name);
    const match = `"*"&$A${r}&"*"`;
    row.getCell(1).value = name ?? null;
    row.getCell(2).value = { formula: `IF($A${r}="","",COUNTIF('班表'!${gridRange},${match}))` };
    const perRow = slots.map((_, si) => `COUNTIF(${rowRange(firstRow + si)},${match})*${hoursCell(firstRow + si)}`).join('+');
    row.getCell(3).value = { formula: `IF($A${r}="","",${perRow})` };
    if (p) {
      row.getCell(4).value = p.slots.filter((k) => valid.has(k)).length;
      row.getCell(5).value = Math.round(hoursOf(event, p.slots) * 100) / 100;
    }
  }
  const lastStatRow = 1 + names.length + extraRows;
  styleGrid(st, 1, lastStatRow, 1, 5);

  const sumStart = lastStatRow + 2;
  const summary: [string, string][] = [
    ['總格數', `${slots.length * dates.length}`],
    ['已排格數', `COUNTA('班表'!${gridRange})-COUNTIF('班表'!${gridRange},"${NONE}")`],
    ['還沒排（黃色）', `COUNTBLANK('班表'!${gridRange})`],
    ['沒人有空（—）', `COUNTIF('班表'!${gridRange},"${NONE}")`],
  ];
  summary.forEach(([label, formula], i) => {
    const row = st.getRow(sumStart + i);
    row.getCell(1).value = label;
    row.getCell(2).value = { formula };
  });
  styleGrid(st, sumStart, sumStart + summary.length - 1, 1, 2, false);
  const note = st.getCell(sumStart + summary.length + 1, 1);
  note.value = '「已排」由班表即時計算；「有空」是助教在系統裡填的資料。格子裡寫兩個名字（例如「王小明、李小華」）也會分別計算。';
  note.font = { ...FONT, size: 11, color: { argb: 'FF6C6C6D' } };

  return wb.xlsx.writeBuffer();
}

function styleGrid(ws: ExcelJS.Worksheet, r1: number, r2: number, c1: number, c2: number, headerRow = true) {
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.border = border;
      cell.font = { ...FONT, ...(cell.font ?? {}) };
      cell.alignment = { vertical: 'middle', horizontal: c === c1 ? 'left' : 'center', ...(cell.alignment ?? {}) };
      if ((headerRow && r === r1) || c === c1) {
        cell.font = { ...cell.font, bold: true };
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).pattern === 'none') cell.fill = HEADER_FILL;
      }
    }
}

function columnLetter(n: number): string {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
