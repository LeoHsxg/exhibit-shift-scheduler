import { useMemo, useState } from 'react';
import { Link2, Users, X } from 'lucide-react';
import {
  dateLabel,
  formatHours,
  hoursOf,
  levelOf,
  shortDate,
  slotKey,
  weekdayLabel,
  type Availability,
  type ShiftEvent,
} from '../lib/schedule';

// 熱度圖：每格顯示幾個人有空，顏色用數量色階。列是時段、欄是日期，和老師的 Excel 一樣。
// 點一格看是誰有空；點右側的名字，只突顯那個人有空的格子。

export function Overview({
  event,
  people,
  onCopyLink,
}: {
  event: ShiftEvent;
  people: Availability[] | null;
  onCopyLink: () => void;
}) {
  const [cell, setCell] = useState<{ date: string; slot: number } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const byKey = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of people ?? []) for (const k of p.slots) m.set(k, [...(m.get(k) ?? []), p.name]);
    return m;
  }, [people]);

  if (!people) return <div className="skeleton" style={{ height: 320, margin: 24 }} />;

  const total = people.length;
  const focusSet = focus ? new Set(people.find((p) => p.name === focus)?.slots ?? []) : null;
  let zero = 0;
  let single = 0;
  for (const d of event.dates)
    for (const s of event.slots) {
      const n = byKey.get(slotKey(d, s))?.length ?? 0;
      if (n === 0) zero++;
      else if (n === 1) single++;
    }

  if (total === 0)
    return (
      <div className="empty">
        <Users />
        <h3 className="title-lg">還沒有人填寫</h3>
        <p>把填寫連結發給助教，他們輸入名字就能填。這裡會即時更新。</p>
        <button className="btn btn-primary" onClick={onCopyLink}>
          <Link2 /> 複製填寫連結
        </button>
      </div>
    );

  const cellSlot = cell ? event.slots[cell.slot] : null;
  const cellNames = cell && cellSlot ? byKey.get(slotKey(cell.date, cellSlot)) ?? [] : [];

  return (
    <div className="overview">
      <div className="heat-wrap">
        <table className="heat" data-focus={focus ? '' : undefined}>
          <thead>
            <tr>
              <th className="heat-corner caption muted">時段</th>
              {event.dates.map((d) => (
                <th key={d} scope="col" className="heat-date">
                  <span className="num">{shortDate(d)}</span>
                  <span className="caption muted">{weekdayLabel(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {event.slots.map((s, si) => (
              <tr key={s.start}>
                <th scope="row" className="heat-slot num">
                  {s.start}
                  <span className="muted">–{s.end}</span>
                </th>
                {event.dates.map((d) => {
                  const names = byKey.get(slotKey(d, s)) ?? [];
                  const level = levelOf(names.length, total);
                  const active = cell?.date === d && cell.slot === si;
                  return (
                    <td key={d}>
                      <button
                        className="heat-cell num"
                        data-level={level}
                        data-active={active || undefined}
                        data-dim={focusSet && !focusSet.has(slotKey(d, s)) ? '' : undefined}
                        onClick={() => setCell(active ? null : { date: d, slot: si })}
                        aria-label={`${dateLabel(d)} ${s.start}–${s.end}，${names.length} 人有空`}
                      >
                        {names.length}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="legend caption muted">
          <span>少</span>
          {[0, 1, 2, 3, 4, 5].map((l) => (
            <span key={l} className="legend-swatch" data-level={l} />
          ))}
          <span>多</span>
          <span className="legend-note body-sm">數字是有空的人數，共 {total} 人填寫</span>
        </div>
      </div>

      <aside className="side">
        {cell && cellSlot ? (
          <div className="side-section">
            <div className="side-title">
              <div>
                <h3 className="title-sm num">{dateLabel(cell.date)}</h3>
                <p className="body-sm muted num">
                  {cellSlot.start}–{cellSlot.end}
                </p>
              </div>
              <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setCell(null)} aria-label="關閉">
                <X />
              </button>
            </div>
            <p className="overline">有空（{cellNames.length}）</p>
            {cellNames.length ? (
              <ul className="name-list">
                {cellNames.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : (
              <p className="body-sm muted">沒有人有空，Excel 裡這格會先填「—」。</p>
            )}
            <p className="overline">沒空（{total - cellNames.length}）</p>
            <ul className="name-list muted">
              {people
                .filter((p) => !cellNames.includes(p.name))
                .map((p) => (
                  <li key={p.name}>{p.name}</li>
                ))}
            </ul>
          </div>
        ) : (
          <>
            <div className="side-section stats">
              <div>
                <p className="caption muted">填寫人數</p>
                <p className="title-lg num">{total}</p>
              </div>
              <div>
                <p className="caption muted">沒人有空</p>
                <p className="title-lg num">
                  {zero} <span className="body-sm muted">格</span>
                </p>
              </div>
              <div>
                <p className="caption muted">只有 1 人有空</p>
                <p className="title-lg num">
                  {single} <span className="body-sm muted">格</span>
                </p>
              </div>
            </div>
            <div className="side-section">
              <p className="overline">點名字只看這個人</p>
              <ul className="person-list">
                {people.map((p) => (
                  <li key={p.name}>
                    <button
                      className="person-row"
                      aria-pressed={focus === p.name}
                      onClick={() => setFocus(focus === p.name ? null : p.name)}
                    >
                      <span>{p.name}</span>
                      <span className="body-sm muted num">{formatHours(hoursOf(event, p.slots))} 小時</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
