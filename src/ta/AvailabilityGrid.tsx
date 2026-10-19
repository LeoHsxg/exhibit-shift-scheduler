import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { groupByWeek, shortDate, slotKey, weekdayLabel, type ShiftEvent } from '../lib/schedule';

// 類似 When2meet 的格子：每一列是一天、每一欄是一個時段（手機直式螢幕剛好放得下 6 欄）。
//
// 操作方式
//   滑鼠：點一下切換；按住拖曳選一個矩形範圍
//   手指：點一下切換；按住約 0.3 秒（會震動一下）再拖曳選一個矩形範圍；直接滑動是捲動頁面
//   點日期：整天切換；點時段標題：每天的這個時段一起切換
// 拖曳的起點決定是「加入」還是「移除」：從空格開始拖就是加入，從已選的格子開始拖就是移除。

interface Cell {
  r: number;
  c: number;
}
interface Drag {
  anchor: Cell;
  current: Cell;
  mode: 'add' | 'remove';
}

const LONG_PRESS_MS = 300;
const MOVE_TOLERANCE = 8;

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
  const rowOf = useMemo(() => new Map(dates.map((d, i) => [d, i])), [dates]);
  const keyAt = (r: number, c: number) => slotKey(dates[r], slots[c]);

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

  const commit = (d: Drag) => {
    const next = new Set(latest.current.selected);
    for (let r = Math.min(d.anchor.r, d.current.r); r <= Math.max(d.anchor.r, d.current.r); r++)
      for (let c = Math.min(d.anchor.c, d.current.c); c <= Math.max(d.anchor.c, d.current.c); c++) {
        if (d.mode === 'add') next.add(keyAt(r, c));
        else next.delete(keyAt(r, c));
      }
    latest.current.onChange(next);
  };

  const startDrag = (cell: Cell) => {
    const mode = latest.current.selected.has(keyAt(cell.r, cell.c)) ? 'remove' : 'add';
    setDragBoth({ anchor: cell, current: cell, mode });
  };

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
          commit({ anchor: p.cell, current: p.cell, mode: latest.current.selected.has(keyAt(p.cell.r, p.cell.c)) ? 'remove' : 'add' });
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
  }, [dates, slots]);

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

  const cols = { gridTemplateColumns: `var(--date-col) repeat(${slots.length}, minmax(0, 1fr))` };

  return (
    <div
      className="avail-grid"
      data-readonly={readOnly || undefined}
      data-dragging={drag ? drag.mode : undefined}
      ref={gridRef}
      onPointerDown={onPointerDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="avail-head" style={cols}>
        <span />
        {slots.map((s) => (
          <button
            key={s.start}
            type="button"
            className="avail-slot-label num"
            onClick={() => toggleMany(dates.map((d) => slotKey(d, s)))}
            disabled={readOnly}
            aria-label={`${s.start} 到 ${s.end}，每天都切換`}
          >
            <span>{s.start}</span>
            <span className="muted">{s.end}</span>
          </button>
        ))}
      </div>

      {weeks.map((week) => (
        <div className="avail-week" key={week[0]} role="grid">
          {week.map((date) => {
            const r = rowOf.get(date)!;
            return (
              <div className="avail-row" key={date} style={cols} role="row">
                <button
                  type="button"
                  className="avail-date-label"
                  onClick={() => toggleMany(slots.map((s) => slotKey(date, s)))}
                  disabled={readOnly}
                  aria-label={`${shortDate(date)} 星期${weekdayLabel(date)}，整天切換`}
                >
                  <span className="num">{shortDate(date)}</span>
                  <span className="avail-weekday">{weekdayLabel(date)}</span>
                </button>
                {slots.map((s, c) => {
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
            );
          })}
        </div>
      ))}
    </div>
  );
}
