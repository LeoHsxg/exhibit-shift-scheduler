// 本機開發用：在 Firebase Emulator 裡放一份測試資料（不會碰到正式專案）
//   npm run emulators   （另一個終端機）
//   npm run seed
// 之後：
//   管理後台 http://localhost:5173/admin   用 Google 登入時選「Add new account」，email 填 admin@example.com
//   助教頁   http://localhost:5173/e/demo

const BASE = 'http://127.0.0.1:8080/v1/projects/demo-exhibit/databases/(default)/documents';
const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }; // emulator 專用，略過 rules

const str = (s) => ({ stringValue: s });
const arr = (values) => ({ arrayValue: { values } });

async function put(path, fields) {
  const res = await fetch(`${BASE}/${path}`, { method: 'PATCH', headers, body: JSON.stringify({ fields }) });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
}

const dates = ['13', '14', '15', '16', '19', '20', '21', '22', '23'].map((d) => `2026-10-${d}`);
const slots = [
  ['12:00', '13:10'],
  ['13:10', '14:10'],
  ['14:10', '15:20'],
  ['15:20', '16:20'],
  ['16:20', '17:20'],
  ['17:20', '18:00'],
];

// 示範用的排班（名字都是虛構的；陳＝陳小華、林＝林小美、黃＝黃志明），每個人有空的時段至少包含被排到的格子
const grid = [
  '-陳林陳林-陳林陳',
  '--林-林--林黃',
  '-黃林-林黃黃林黃',
  '陳黃林-林陳黃林黃',
  '陳陳陳--陳陳陳黃',
  '陳陳陳陳陳陳陳陳陳',
];
const full = { 陳: '陳小華', 林: '林小美', 黃: '黃志明' };
const people = { 陳小華: new Set(), 林小美: new Set(), 黃志明: new Set(), 王小明: new Set() };
grid.forEach((row, si) =>
  [...row].forEach((ch, di) => {
    if (full[ch]) people[full[ch]].add(`${dates[di]}_${slots[si][0]}`);
  }),
);
// 多加一些有空但沒被排到的時段，熱度圖比較有層次
for (const d of dates.slice(0, 5)) people['王小明'].add(`${d}_14:10`).add(`${d}_15:20`);
for (const d of ['2026-10-14', '2026-10-21']) people['林小美'].add(`${d}_16:20`).add(`${d}_17:20`);
people['黃志明'].add('2026-10-22_12:00').add('2026-10-22_13:10');

await put('admins/admin@example.com', {});
await put('events/demo', {
  title: str('2026 秋季展覽'),
  dates: arr(dates.map(str)),
  slots: arr(slots.map(([start, end]) => ({ mapValue: { fields: { start: str(start), end: str(end) } } }))),
  isOpen: { booleanValue: true },
  createdAt: { timestampValue: new Date().toISOString() },
});
for (const [name, set] of Object.entries(people)) {
  await put(`events/demo/availability/${encodeURIComponent(name)}`, {
    slots: arr([...set].sort().map(str)),
    updatedAt: { timestampValue: new Date().toISOString() },
  });
}
console.log('已寫入測試資料：admins/admin@example.com、events/demo（4 人）');
