import { useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import {
  DEFAULT_SLOTS,
  datesBetween,
  formatHours,
  groupByWeek,
  shortDate,
  slotHours,
  weekdayLabel,
  weekdayOf,
  type Slot,
} from '../lib/schedule';

// ── 日期：起訖日＋星期幾，產生候選日期；再個別點掉放假的日子 ──

export interface DateDraft {
  start: string;
  end: string;
  weekdays: number[];
  excluded: string[];
}

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function dateDraftFrom(dates: string[]): DateDraft {
  if (dates.length === 0) return { start: '', end: '', weekdays: [1, 2, 3, 4, 5], excluded: [] };
  const start = dates[0];
  const end = dates[dates.length - 1];
  const weekdays = [...new Set(dates.map(weekdayOf))];
  const chosen = new Set(dates);
  return { start, end, weekdays, excluded: datesBetween(start, end, weekdays).filter((d) => !chosen.has(d)) };
}

export function datesFromDraft(d: DateDraft): string[] {
  if (!d.start || !d.end) return [];
  const excluded = new Set(d.excluded);
  return datesBetween(d.start, d.end, d.weekdays).filter((x) => !excluded.has(x));
}

export function dateDraftError(d: DateDraft): string | undefined {
  if (!d.start || !d.end) return '請選擇開始與結束日期';
  if (d.end < d.start) return '結束日期要在開始日期之後';
  if (datesFromDraft(d).length === 0) return '至少要有一天';
  if (datesBetween(d.start, d.end, [0, 1, 2, 3, 4, 5, 6]).length > 120) return '檔期最長 120 天';
}

export function DateEditor({
  value,
  onChange,
  showChips = true,
}: {
  value: DateDraft;
  onChange: (v: DateDraft) => void;
  showChips?: boolean;
}) {
  const candidates = useMemo(
    () => (value.start && value.end && value.end >= value.start ? datesBetween(value.start, value.end, value.weekdays) : []),
    [value.start, value.end, value.weekdays],
  );
  const excluded = new Set(value.excluded);
  const total = candidates.filter((d) => !excluded.has(d)).length;

  return (
    <div className="date-editor">
      <div className="date-range">
        <label className="field">
          <span className="label-md">開始日期</span>
          <input
            type="date"
            className="input"
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="label-md">結束日期</span>
          <input
            type="date"
            className="input"
            value={value.end}
            min={value.start}
            onChange={(e) => onChange({ ...value, end: e.target.value })}
          />
        </label>
      </div>
      <div className="field">
        <span className="label-md">每週哪幾天</span>
        <div className="weekday-picks">
          {WEEKDAY_ORDER.map((w) => {
            const on = value.weekdays.includes(w);
            return (
              <button
                key={w}
                type="button"
                className="chip"
                aria-pressed={on}
                onClick={() =>
                  onChange({ ...value, weekdays: on ? value.weekdays.filter((x) => x !== w) : [...value.weekdays, w] })
                }
              >
                {'日一二三四五六'[w]}
              </button>
            );
          })}
        </div>
      </div>
      {showChips && candidates.length > 0 && (
        <div className="field">
          <span className="label-md">
            共 <span className="num">{total}</span> 天
            <span className="muted body-sm">　點一下可以排除放假的日子</span>
          </span>
          <div className="date-chips">
            {groupByWeek(candidates).map((week) => (
              <div key={week[0]} className="date-chip-week">
                {week.map((d) => {
                  const on = !excluded.has(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      className="chip num"
                      aria-pressed={on}
                      onClick={() =>
                        onChange({
                          ...value,
                          excluded: on ? [...value.excluded, d] : value.excluded.filter((x) => x !== d),
                        })
                      }
                    >
                      {shortDate(d)}
                      <span className="chip-sub">{weekdayLabel(d)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 時段 ──

export function slotsError(slots: Slot[]): string | undefined {
  if (slots.length === 0) return '至少要有一個時段';
  for (const s of slots) {
    if (!s.start || !s.end) return '每個時段都要填開始與結束時間';
    if (s.end <= s.start) return `${s.start} 的時段，結束時間要晚於開始時間`;
  }
  const starts = slots.map((s) => s.start);
  if (new Set(starts).size !== starts.length) return '有兩個時段的開始時間相同';
}

export function SlotEditor({ value, onChange }: { value: Slot[]; onChange: (v: Slot[]) => void }) {
  const set = (i: number, patch: Partial<Slot>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const add = () => {
    const last = value[value.length - 1];
    onChange([...value, last ? { start: last.end, end: last.end } : { start: '12:00', end: '13:00' }]);
  };
  return (
    <div className="slot-editor">
      {value.map((s, i) => (
        <div className="slot-row" key={i}>
          <input
            type="time"
            className="input num"
            value={s.start}
            aria-label={`第 ${i + 1} 個時段開始`}
            onChange={(e) => set(i, { start: e.target.value })}
          />
          <span className="muted">–</span>
          <input
            type="time"
            className="input num"
            value={s.end}
            aria-label={`第 ${i + 1} 個時段結束`}
            onChange={(e) => set(i, { end: e.target.value })}
          />
          <span className="slot-hours body-sm muted num">{s.end > s.start ? `${formatHours(slotHours(s))} 小時` : ''}</span>
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label="刪除這個時段"
            disabled={value.length <= 1}
          >
            <X />
          </button>
        </div>
      ))}
      <div className="slot-actions">
        <button type="button" className="btn btn-sm" onClick={add}>
          <Plus /> 新增時段
        </button>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(DEFAULT_SLOTS)}>
          恢復預設
        </button>
      </div>
    </div>
  );
}
