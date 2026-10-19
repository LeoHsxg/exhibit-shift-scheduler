import { useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { CalendarPlus, CalendarRange, Plus } from 'lucide-react';
import { watchEvents } from '../lib/api';
import { dateRangeLabel, type ShiftEvent } from '../lib/schedule';
import { useToast } from '../ui/common';
import { NavBar } from './AdminApp';
import { CreateEventDialog } from './CreateEventDialog';
import { EventView } from './EventView';

// 工具頁版面：左側檔期清單，右側選取的檔期。選取的檔期記在網址的 ?event= 上，重新整理不會跑掉
function readSelected() {
  return new URLSearchParams(location.search).get('event');
}

export function Dashboard({ user }: { user: User }) {
  const [events, setEvents] = useState<ShiftEvent[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(readSelected);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  useEffect(
    () =>
      watchEvents(setEvents, () => {
        toast('讀取檔期失敗', 'danger');
        setEvents([]);
      }),
    [toast],
  );

  const select = (id: string | null) => {
    setSelectedId(id);
    const url = new URL(location.href);
    if (id) url.searchParams.set('event', id);
    else url.searchParams.delete('event');
    history.replaceState(null, '', url);
  };

  // 桌面版沒有選取（或選取的檔期剛被刪掉）時，自動選最新的檔期
  useEffect(() => {
    if (!events?.length || events.some((e) => e.id === selectedId)) return;
    if (matchMedia('(min-width: 769px)').matches) select(events[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, selectedId]);

  const selected = events?.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="admin-page admin-app" data-detail={selected ? '' : undefined}>
      <NavBar user={user} />
      <div className="admin-body">
        <aside className="event-list">
          <div className="event-list-head">
            <h2 className="title-sm">檔期</h2>
            <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
              <Plus /> 新增檔期
            </button>
          </div>
          <div className="event-list-items">
            {events === null ? (
              [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 72 }} />)
            ) : events.length === 0 ? (
              <div className="empty">
                <CalendarRange />
                <h3 className="title-sm">還沒有檔期</h3>
                <p>建立一個檔期，設定日期與時段，再把填寫連結發給助教。</p>
              </div>
            ) : (
              events.map((ev) => (
                <button
                  key={ev.id}
                  className="event-card"
                  aria-current={ev.id === selectedId}
                  onClick={() => select(ev.id)}
                >
                  <span className="event-card-top">
                    <span className="title-sm event-card-title">{ev.title || '未命名檔期'}</span>
                    <span className="status" data-tone={ev.isOpen ? 'success' : 'muted'}>
                      {ev.isOpen ? '開放中' : '已截止'}
                    </span>
                  </span>
                  <span className="body-sm muted num">{dateRangeLabel(ev.dates)}</span>
                </button>
              ))
            )}
          </div>
        </aside>

        <main className="event-detail">
          {selected ? (
            <EventView key={selected.id} event={selected} onBack={() => select(null)} onDeleted={() => select(null)} />
          ) : events && events.length > 0 ? (
            <div className="empty">
              <CalendarRange />
              <p>從左側選一個檔期。</p>
            </div>
          ) : events ? (
            <div className="empty">
              <CalendarPlus />
              <h3 className="title-lg">建立第一個檔期</h3>
              <p>預設帶入 12:00–18:00 的六個時段，建立後可以再調整。</p>
              <button className="btn btn-primary" onClick={() => setCreating(true)}>
                <Plus /> 新增檔期
              </button>
            </div>
          ) : null}
        </main>
      </div>

      {creating && (
        <CreateEventDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            select(id);
          }}
        />
      )}
    </div>
  );
}
