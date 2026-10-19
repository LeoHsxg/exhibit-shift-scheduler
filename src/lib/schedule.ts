import type { Timestamp } from 'firebase/firestore';

export interface Slot {
  start: string; // "12:00"
  end: string; // "13:10"
}

export interface ShiftEvent {
  id: string;
  title: string;
  dates: string[]; // "2026-10-13"，已排序
  slots: Slot[]; // 依開始時間排序
  isOpen: boolean;
  createdAt?: Timestamp;
}

export interface Availability {
  name: string;
  slots: string[]; // slotKey 的清單
  updatedAt?: Timestamp;
}

/** 建立檔期時預設帶入的時段，管理者可以再改 */
export const DEFAULT_SLOTS: Slot[] = [
  { start: '12:00', end: '13:10' },
  { start: '13:10', end: '14:10' },
  { start: '14:10', end: '15:20' },
  { start: '15:20', end: '16:20' },
  { start: '16:20', end: '17:20' },
  { start: '17:20', end: '18:00' },
];

/** 一格的識別字串：日期加開始時間。用開始時間而不是陣列位置，增刪時段時其他格不會錯位 */
export const slotKey = (date: string, slot: Slot) => `${date}_${slot.start}`;

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const weekdayOf = (iso: string) => parseDate(iso).getDay();
export const weekdayLabel = (iso: string) => WEEKDAYS[weekdayOf(iso)];

/** "10/13" */
export function shortDate(iso: string): string {
  const d = parseDate(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** "10/13(二)"，和老師原本的 Excel 一樣 */
export const dateLabel = (iso: string) => `${shortDate(iso)}(${weekdayLabel(iso)})`;

export function dateRangeLabel(dates: string[]): string {
  if (dates.length === 0) return '尚未設定日期';
  if (dates.length === 1) return dateLabel(dates[0]);
  return `${dateLabel(dates[0])} – ${dateLabel(dates[dates.length - 1])}`;
}

/** 起訖日之間、星期在 weekdays 裡的所有日期 */
export function datesBetween(start: string, end: string, weekdays: number[]): string[] {
  const out: string[] = [];
  const d = parseDate(start);
  const last = parseDate(end);
  for (let i = 0; d <= last && i < 400; i++) {
    if (weekdays.includes(d.getDay())) out.push(toIso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** 依週分組（週一為一週的開始），手機上每週之間留一點空隙比較好找 */
export function groupByWeek(dates: string[]): string[][] {
  const groups: string[][] = [];
  let lastMonday = '';
  for (const iso of dates) {
    const d = parseDate(iso);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const monday = toIso(d);
    if (monday !== lastMonday) groups.push([]);
    groups[groups.length - 1].push(iso);
    lastMonday = monday;
  }
  return groups;
}

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** 時段長度（小時），例如 12:00–13:10 是 1.17 */
export function slotHours(slot: Slot): number {
  return Math.max(0, toMinutes(slot.end) - toMinutes(slot.start)) / 60;
}

export function formatHours(h: number): string {
  return String(Math.round(h * 100) / 100);
}

export function sortSlots(slots: Slot[]): Slot[] {
  return [...slots].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

/** 只算還在檔期內的格子（管理者刪掉的日期或時段，舊資料直接忽略） */
export function validKeys(event: ShiftEvent): Set<string> {
  const keys = new Set<string>();
  for (const date of event.dates) for (const slot of event.slots) keys.add(slotKey(date, slot));
  return keys;
}

export function hoursOf(event: ShiftEvent, keys: Iterable<string>): number {
  const byStart = new Map(event.slots.map((s) => [s.start, slotHours(s)]));
  const valid = validKeys(event);
  let total = 0;
  for (const k of keys) if (valid.has(k)) total += byStart.get(k.split('_')[1]) ?? 0;
  return total;
}

/**
 * 整理名字：去掉頭尾空白、連續空白合併。回傳錯誤訊息或整理後的名字。
 * 名字直接當 Firestore 文件 ID，所以不能有斜線；Excel 的下拉選單用逗號分隔，所以也不能有逗號。
 */
export function normalizeName(raw: string): { name: string; error?: string } {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return { name, error: '請輸入你的名字' };
  if (name.length > 20) return { name, error: `名字最多 20 個字，目前 ${name.length} 個字` };
  if (/[/,，]/.test(name)) return { name, error: '名字裡不能有斜線或逗號' };
  if (name === '.' || name === '..' || /^__.*__$/.test(name)) return { name, error: '這個名字無法使用，請換一個' };
  return { name };
}

/** 熱度圖的色階：0 表示沒人，1～5 依有空人數占填寫人數的比例 */
export function levelOf(count: number, total: number): number {
  if (count === 0 || total === 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil((count / total) * 5)));
}
