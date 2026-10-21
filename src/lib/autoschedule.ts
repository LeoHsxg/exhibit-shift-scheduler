import { HOURS_PER_SLOT, slotKey, validKeys, type Availability, type ShiftEvent } from './schedule';

// 自動排班草稿：每格排 1 個有空的人，結果給老師在 Excel 上再調整。
//
// 優先順序：
//   1. 能填的格子全部填滿（只要有人有空就一定排人，這條不拿去跟其他條件交換）
//   2. 同一個人同一天的班盡量連續
//   3. 依時數平均分配（每個時段一律算 1 小時，不看實際分鐘數）
//
// 做法：先用 greedy 排出一版（有空人數少的格子先排），再反覆嘗試「把某格或某一段換給別人」，
// 只要整體成本變低就換，直到換不動為止。成本是每個人各自算再加總：
//   時數²            總時數固定，平方和越小代表分得越平均
//   每段班 BLOCK      一段＝同一天連續的幾格。段數越少，班越連續
//   同天多段 SPLIT    同一天被拆成兩段以上（中間空一段）額外再扣
//   超過上限 CAP      有設每人時數上限時，超過的部分扣很重；但沒有別人有空時還是會排他
//
// BLOCK=8 的意思大約是：兩人時數差 3～4 小時以內，寧可讓班連續；差更多才拆開來平均。

const BLOCK = 8;
const SPLIT = 8;
const CAP = 1000;
const MAX_ROUNDS = 50;

export interface AutoScheduleOptions {
  /** 每人時數上限（小時）。超過時只在沒有別人有空的格子才會排他 */
  maxHours?: number;
}

export function autoSchedule(event: ShiftEvent, people: Availability[], options: AutoScheduleOptions = {}): Map<string, string> {
  const { dates, slots } = event;
  const S = slots.length;
  const valid = validKeys(event);
  const names = people.map((p) => p.name);
  const P = names.length;
  const cellKey = (c: number) => slotKey(dates[Math.floor(c / S)], slots[c % S]);

  // 每格有誰有空（用人的索引）
  const cands: number[][] = [];
  const keyIndex = new Map<string, number>();
  for (let c = 0; c < dates.length * S; c++) {
    cands.push([]);
    keyIndex.set(cellKey(c), c);
  }
  people.forEach((p, pi) => {
    for (const k of new Set(p.slots)) {
      const c = keyIndex.get(k);
      if (c !== undefined && valid.has(k)) cands[c].push(pi);
    }
  });

  const owner: number[] = cands.map(() => -1);
  const hours: number[] = names.map(() => 0);

  // 一個人在某天的段數（以時段順序相鄰算連續）
  const runsOnDay = (pi: number, d: number) => {
    let runs = 0;
    for (let s = 0; s < S; s++) if (owner[d * S + s] === pi && (s === 0 || owner[d * S + s - 1] !== pi)) runs++;
    return runs;
  };
  const dayCost = (pi: number, d: number) => {
    const runs = runsOnDay(pi, d);
    return runs * BLOCK + Math.max(0, runs - 1) * SPLIT;
  };
  const hourCost = (h: number) => {
    const over = options.maxHours !== undefined ? Math.max(0, h - options.maxHours) : 0;
    return h * h + over * CAP;
  };

  /** 把 cells（同一天）從現在的人改給 to，回傳成本變化；dry=true 時只試算、不真的改 */
  const reassign = (cells: number[], to: number, dry: boolean) => {
    const d = Math.floor(cells[0] / S);
    const from = [...new Set(cells.map((c) => owner[c]).filter((pi) => pi >= 0))];
    const affected = [...new Set([...from, to])];
    const before = affected.reduce((sum, pi) => sum + dayCost(pi, d) + hourCost(hours[pi]), 0);
    const prev = cells.map((c) => owner[c]);
    const move = (c: number, pi: number) => {
      if (owner[c] >= 0) hours[owner[c]] -= HOURS_PER_SLOT;
      owner[c] = pi;
      if (pi >= 0) hours[pi] += HOURS_PER_SLOT;
    };
    cells.forEach((c) => move(c, to));
    const after = affected.reduce((sum, pi) => sum + dayCost(pi, d) + hourCost(hours[pi]), 0);
    if (dry) cells.forEach((c, i) => move(c, prev[i]));
    return after - before;
  };

  // ── 第一步：greedy。有空人數少的格子先排，每格挑成本增加最少的人 ──
  const order = cands
    .map((list, c) => ({ c, n: list.length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => a.n - b.n || a.c - b.c)
    .map((x) => x.c);
  for (const c of order) {
    let best = -1;
    let bestDelta = Infinity;
    for (const pi of cands[c]) {
      const delta = reassign([c], pi, true);
      if (delta < bestDelta - 1e-9) {
        best = pi;
        bestDelta = delta;
      }
    }
    reassign([c], best, false);
  }

  // ── 第二步：局部調整。試著把一格、或某人一段班的開頭／結尾／整段換給別人 ──
  const available = (pi: number, c: number) => cands[c].includes(pi);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let improved = false;
    for (let d = 0; d < dates.length; d++) {
      for (const cells of segmentsOnDay(d)) {
        let bestTo = -1;
        let bestDelta = -1e-9;
        for (let pi = 0; pi < P; pi++) {
          if (cells.every((c) => owner[c] === pi) || !cells.every((c) => available(pi, c))) continue;
          const delta = reassign(cells, pi, true);
          if (delta < bestDelta) {
            bestTo = pi;
            bestDelta = delta;
          }
        }
        if (bestTo >= 0) {
          reassign(cells, bestTo, false);
          improved = true;
        }
      }
    }
    if (!improved) break;
  }

  /** 某天可以整批換人的格子組合：每一格，以及每段班的所有前綴、後綴 */
  function segmentsOnDay(d: number): number[][] {
    const out: number[][] = [];
    for (let s = 0; s < S; s++) if (owner[d * S + s] >= 0) out.push([d * S + s]);
    for (let s = 0; s < S; ) {
      const pi = owner[d * S + s];
      let e = s;
      while (e + 1 < S && pi >= 0 && owner[d * S + e + 1] === pi) e++;
      if (pi >= 0 && e > s) {
        const run = Array.from({ length: e - s + 1 }, (_, i) => d * S + s + i);
        for (let len = 2; len <= run.length; len++) {
          out.push(run.slice(0, len));
          if (len < run.length) out.push(run.slice(run.length - len));
        }
      }
      s = e + 1;
    }
    return out;
  }

  const result = new Map<string, string>();
  owner.forEach((pi, c) => {
    if (pi >= 0) result.set(cellKey(c), names[pi]);
  });
  return result;
}
