import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  HOURS_PER_SLOT,
  groupByWeek,
  parseDate,
  shortDate,
  slotKey,
  toIso,
  weekdayLabel,
  weekdayOf,
  type ShiftEvent,
} from '../lib/schedule';

// 週檢視，和日曆一樣：每一欄是一天，每一列是一個時段，一次顯示一週，用上下週按鈕切換。
// 週一到週五一定顯示；週六、週日只有檔期裡有排到那天才會多一欄。
// 每個時段都算 1 小時，列高一樣；不在檔期內的日子（例如某週休館）畫成虛線空格，不能選。
//
// 操作方式
//   滑鼠：點一下切換；按住拖曳選一個矩形範圍
//   手指：點一下切換；按住約 0.3 秒（會震動一下）再拖曳選一個矩形範圍；直接滑動是捲動頁面
//   點日期：整天切換；點時段標題：這一週每天的這個時段一起切換
// 拖曳的起點決定是「加入」還是「移除」：從空格開始拖就是加入，從已選的格子開始拖就是移除。

interface Cell {
  r: number; // 第幾個時段
  c: number; // 第幾欄（對到 columns 裡的星期）
}
interface Drag {
  anchor: Cell;
  current: Cell;
  mode: 'add' | 'remove';
}

const LONG_PRESS_MS = 300;
const MOVE_TOLERANCE = 8;
const WEEKDAYS_FROM_MONDAY = ['一', '二', '三', '四', '五', '六', '日'];

function mondayOf(iso: string): Date {
  const d = parseDate(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** 要顯示哪幾個星期（0 = 週一）：週一到週五固定，週六日要檔期裡真的有才顯示 */
function visibleWeekdays(dates: string[]): number[] {
  const has = new Set(dates.map((d) => (weekdayOf(d) + 6) % 7));
  return [0, 1, 2, 3, 4, 5, 6].filter((i) => i < 5 || has.has(i));
}

/** 這一週每一欄對到的日期，不在檔期內的日子是 null */
function weekColumns(week: string[], weekdays: number[]): (string | null)[] {
  const monday = mondayOf(week[0]);
  return weekdays.map((i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    const iso = toIso(d);
    return week.includes(iso) ? iso : null;
  });
}

/** "11/27 – 12/3"：週一到週日 */
function weekRangeLabel(week: string[]): string {
  const monday = mondayOf(week[0]);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return `${shortDate(toIso(monday))} – ${shortDate(toIso(sunday))}`;
}

/** 打開時先顯示今天所在（或之後第一個）的那一週，檔期已經過了就顯示第一週 */
function initialWeek(weeks: string[][]): number {
  const today = toIso(new Date());
  const i = weeks.findIndex((w) => w[w.length - 1] >= today);
  return i === -1 ? 0 : i;
}

export function AvailabilityGrid({
  event,
  selected,
  onChange,
  readOnly,
}: {
  event: ShiftEvent;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  readOnly?: boolean;
}) {
  const { dates, slots } = event;
  const weeks = useMemo(() => groupByWeek(dates), [dates]);
  const [weekIndex, setWeekIndex] = useState(() => initialWeek(weeks));
  const wi = Math.min(weekIndex, Math.max(0, weeks.length - 1)); // 管理者刪掉日期後週數可能變少
  const week = weeks[wi] ?? [];
  const weekdays = useMemo(() => visibleWeekdays(dates), [dates]);
  const days = useMemo(() => (week.length ? weekColumns(week, weekdays) : []), [week, weekdays]);
  const keyAt = (r: number, c: number) => (days[c] ? slotKey(days[c]!, slots[r]) : null);

  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; cell: Cell; timer: number; pointerId: number } | null>(null);

  // 最新的 selected / onChange，給 window 上的事件處理用
  const latest = useRef({ selected, onChange });
  latest.current = { selected, onChange };

  const setDragBoth = (d: Drag | null) => {
    dragRef.current = d;
    setDrag(d);
  };

  const cellFromPoint = (x: number, y: number): Cell | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-r]');
    return el ? { r: Number(el.dataset.r), c: Number(el.dataset.c) } : null;
  };

  const inRect = (d: Drag, r: number, c: number) =>
    r >= Math.min(d.anchor.r, d.current.r) &&
    r <= Math.max(d.anchor.r, d.current.r) &&
    c >= Math.min(d.anchor.c, d.current.c) &&
    c <= Math.max(d.anchor.c, d.current.c);

  // 範圍裡跨到閉館日的格子直接跳過
  const commit = (d: Drag) => {
    const next = new Set(latest.current.selected);
    for (let r = Math.min(d.anchor.r, d.current.r); r <= Math.max(d.anchor.r, d.current.r); r++)
      for (let c = Math.min(d.anchor.c, d.current.c); c <= Math.max(d.anchor.c, d.current.c); c++) {
        const key = keyAt(r, c);
        if (!key) continue;
        if (d.mode === 'add') next.add(key);
        else next.delete(key);
      }
    latest.current.onChange(next);
  };

  const modeAt = (cell: Cell): Drag['mode'] => (latest.current.selected.has(keyAt(cell.r, cell.c)!) ? 'remove' : 'add');

  const startDrag = (cell: Cell) => setDragBoth({ anchor: cell, current: cell, mode: modeAt(cell) });

  // 拖曳中的移動與放開掛在 window 上，手指或滑鼠移出格子範圍也不會中斷
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = press.current;
      if (p && !dragRef.current && Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE) {
        // 長按還沒成立就移動了：這是捲動，不是選取
        clearTimeout(p.timer);
        press.current = null;
        return;
      }
      const d = dragRef.current;
      if (!d) return;
      const cell = cellFromPoint(e.clientX, e.clientY);
      if (cell && (cell.r !== d.current.r || cell.c !== d.current.c)) setDragBoth({ ...d, current: cell });
    };
    const onUp = () => {
      const p = press.current;
      if (p) {
        clearTimeout(p.timer);
        press.current = null;
        if (!dragRef.current) {
          // 手指輕點：切換一格
          commit({ anchor: p.cell, current: p.cell, mode: modeAt(p.cell) });
          return;
        }
      }
      if (dragRef.current) {
        commit(dragRef.current);
        setDragBoth(null);
      }
    };
    const onCancel = () => {
      if (press.current) clearTimeout(press.current.timer);
      press.current = null;
      setDragBoth(null);
    };
    // 手指拖曳選取時擋住頁面捲動（必須是 non-passive 才能 preventDefault）
    const onTouchMove = (e: TouchEvent) => {
      if (dragRef.current && e.cancelable) e.preventDefault();
    };
    const grid = gridRef.current;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    grid?.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      grid?.removeEventListener('touchmove', onTouchMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, slots]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (readOnly || e.button !== 0) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
    if (!el) return;
    const cell = { r: Number(el.dataset.r), c: Number(el.dataset.c) };
    if (e.pointerType === 'touch') {
      const timer = window.setTimeout(() => {
        startDrag(cell);
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
      press.current = { x: e.clientX, y: e.clientY, cell, timer, pointerId: e.pointerId };
    } else {
      e.preventDefault(); // 避免拖曳時反白文字
      startDrag(cell);
    }
  };

  const toggleMany = (keys: string[]) => {
    if (readOnly) return;
    const next = new Set(selected);
    const allOn = keys.every((k) => next.has(k));
    for (const k of keys) {
      if (allOn) next.delete(k);
      else next.add(k);
    }
    onChange(next);
  };

  const onKeyDown = (e: React.KeyboardEvent, key: string) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleMany([key]);
    }
  };

  const openDays = days.filter((d): d is string => d !== null);
  const weekHours = openDays.reduce((n, d) => n + slots.filter((s) => selected.has(slotKey(d, s))).length, 0) * HOURS_PER_SLOT;

  // 每個時段都算 1 小時，列高一樣
  const layout = {
    gridTemplateColumns: `var(--time-col) repeat(${days.length}, minmax(0, 1fr))`,
    gridTemplateRows: `auto repeat(${slots.length}, var(--hour-h))`,
  };

  return (
    <div className="avail">
      {weeks.length > 1 && (
        <div className="avail-nav">
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={() => setWeekIndex(wi - 1)}
            disabled={wi === 0}
            aria-label="上一週"
          >
            <ChevronLeft />
          </button>
          <div className="avail-nav-label" aria-live="polite">
            <span className="num">{weekRangeLabel(week)}</span>
            <span className="avail-nav-sub">
              第 {wi + 1} / {weeks.length} 週{readOnly ? '' : ` · 這週已選 ${weekHours} 小時`}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={() => setWeekIndex(wi + 1)}
            disabled={wi === weeks.length - 1}
            aria-label="下一週"
          >
            <ChevronRight />
          </button>
        </div>
      )}

      <div
        className="avail-grid"
        role="grid"
        style={layout}
        data-readonly={readOnly || undefined}
        data-dragging={drag ? drag.mode : undefined}
        ref={gridRef}
        onPointerDown={onPointerDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="avail-row" role="row">
          <span />
          {days.map((date, c) =>
            date ? (
              <button
                key={c}
                type="button"
                className="avail-date-label"
                onClick={() => toggleMany(slots.map((s) => slotKey(date, s)))}
                disabled={readOnly}
                aria-label={`${shortDate(date)} 星期${weekdayLabel(date)}，整天切換`}
              >
                <span className="num">{shortDate(date)}</span>
                <span className="avail-weekday">{weekdayLabel(date)}</span>
              </button>
            ) : (
              <span key={c} className="avail-date-label" data-closed aria-hidden="true">
                <span className="avail-weekday">{WEEKDAYS_FROM_MONDAY[weekdays[c]]}</span>
              </span>
            ),
          )}
        </div>

        {slots.map((s, r) => (
          <div className="avail-row" role="row" key={s.start}>
            <button
              type="button"
              className="avail-slot-label num"
              onClick={() => toggleMany(openDays.map((d) => slotKey(d, s)))}
              disabled={readOnly}
              aria-label={`${s.start} 到 ${s.end}，這週每天都切換`}
            >
              <span>{s.start}</span>
              <span className="muted">{s.end}</span>
            </button>
            {days.map((date, c) => {
              if (!date) return <div key={c} className="avail-cell" data-closed aria-hidden="true" />;
              const key = slotKey(date, s);
              const on = selected.has(key);
              const preview = drag && inRect(drag, r, c) ? drag.mode : undefined;
              const shown = preview ? preview === 'add' : on;
              return (
                <div
                  key={key}
                  role="gridcell"
                  tabIndex={readOnly ? -1 : 0}
                  aria-selected={on}
                  aria-label={`${shortDate(date)} ${s.start}–${s.end}${on ? '，有空' : ''}`}
                  className="avail-cell"
                  data-r={r}
                  data-c={c}
                  data-on={shown || undefined}
                  data-preview={preview}
                  onKeyDown={(e) => onKeyDown(e, key)}
                >
                  {shown && <Check aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
