import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { CalendarX2, CircleAlert, CircleCheck, Info, Lock, RotateCcw } from 'lucide-react';
import { fetchAvailability, fetchEvent, saveAvailability } from '../lib/api';
import { dateRangeLabel, formatHours, hoursOf, normalizeName, validKeys, type ShiftEvent } from '../lib/schedule';
import { Emblem, FullPageSpinner, ThemeToggle, formatTime, useToast } from '../ui/common';
import { AvailabilityGrid } from './AvailabilityGrid';
import './ta.css';

const nameStorageKey = (eventId: string) => `exhibit:name:${eventId}`;

function readStoredName(eventId: string): string {
  try {
    return localStorage.getItem(nameStorageKey(eventId)) ?? '';
  } catch {
    return '';
  }
}

function storeName(eventId: string, name: string | null) {
  try {
    if (name) localStorage.setItem(nameStorageKey(eventId), name);
    else localStorage.removeItem(nameStorageKey(eventId));
  } catch {
    /* 存不了就每次重新輸入 */
  }
}

export default function TaPage({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<ShiftEvent | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [initial, setInitial] = useState<string[] | null>(null);

  useEffect(() => {
    fetchEvent(eventId)
      .then((ev) => {
        setEvent(ev);
        if (ev) document.title = `${ev.title}｜展覽排班`;
      })
      .catch(() => setLoadError(true));
  }, [eventId]);

  const enter = useCallback(
    async (n: string) => {
      const slots = await fetchAvailability(eventId, n);
      storeName(eventId, n);
      setInitial(slots ?? []);
      setName(n);
      return slots;
    },
    [eventId],
  );

  if (loadError)
    return (
      <Shell>
        <div className="empty">
          <CircleAlert />
          <h2 className="title-lg">無法連線</h2>
          <p>請確認網路連線後重新整理頁面。</p>
          <button className="btn" onClick={() => location.reload()}>
            重新整理
          </button>
        </div>
      </Shell>
    );
  if (event === undefined) return <FullPageSpinner />;
  if (event === null)
    return (
      <Shell>
        <div className="empty">
          <CalendarX2 />
          <h2 className="title-lg">找不到這個檔期</h2>
          <p>連結可能打錯了，或檔期已經被刪除。請向老師確認填寫連結。</p>
        </div>
      </Shell>
    );

  return (
    <Shell event={event}>
      {name === null || initial === null ? (
        <NameStep eventId={eventId} event={event} onEnter={enter} />
      ) : (
        <FillStep
          key={name}
          event={event}
          name={name}
          initial={initial}
          onSwitchName={() => {
            storeName(eventId, null);
            setName(null);
            setInitial(null);
          }}
        />
      )}
    </Shell>
  );
}

function Shell({ event, children }: { event?: ShiftEvent; children: React.ReactNode }) {
  return (
    <div className="ta">
      <header className="ta-header">
        <div className="ta-header-inner">
          <Emblem />
          <div className="ta-header-text">
            <h1 className="headline-lg">{event ? event.title : '展覽排班'}</h1>
            {event && <p className="muted num">{dateRangeLabel(event.dates)}</p>}
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main className="ta-main">{children}</main>
    </div>
  );
}

// ── 第一步：輸入名字 ──

function NameStep({
  eventId,
  event,
  onEnter,
}: {
  eventId: string;
  event: ShiftEvent;
  onEnter: (name: string) => Promise<string[] | null>;
}) {
  const [value, setValue] = useState(() => readStoredName(eventId));
  const [error, setError] = useState<string>();
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const autoEntered = useRef(false);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const { name, error } = normalizeName(value);
    setTouched(true);
    setError(error);
    if (error) return;
    setBusy(true);
    try {
      const slots = await onEnter(name);
      if (slots && slots.length) toast(`已載入你上次填的時段`);
    } catch {
      setError('連線失敗，請稍後再試');
      setBusy(false);
    }
  };

  // 這台裝置之前填過，直接帶入
  useEffect(() => {
    if (!autoEntered.current && readStoredName(eventId)) {
      autoEntered.current = true;
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form className="name-step" onSubmit={submit} noValidate>
      {!event.isOpen && <ClosedNotice />}
      <div className="field">
        <label className="field-label" htmlFor="ta-name">
          你的名字
        </label>
        <p className="field-hint" id="ta-name-hint">
          下次輸入同一個名字，就能看到並修改之前填的時段。
        </p>
        <input
          id="ta-name"
          className="input input-lg"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (touched) setError(normalizeName(e.target.value).error);
          }}
          placeholder="例如：王小明"
          autoComplete="name"
          enterKeyHint="go"
          maxLength={30}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'ta-name-error' : 'ta-name-hint'}
          autoFocus={!readStoredName(eventId)}
        />
        {error && (
          <p className="field-error" id="ta-name-error">
            <CircleAlert />
            {error}
          </p>
        )}
      </div>
      <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
        {busy && <span className="spinner" />}
        {event.isOpen ? '開始填寫' : '查看我填的時段'}
      </button>
    </form>
  );
}

function ClosedNotice() {
  return (
    <div className="notice" data-tone="warning">
      <Lock />
      <span>這個檔期已經截止填寫，只能查看，不能再修改。有問題請直接聯絡老師。</span>
    </div>
  );
}

// ── 第二步：點選有空的時段，自動儲存 ──

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: Date } | { kind: 'error'; closed: boolean };

function FillStep({
  event,
  name,
  initial,
  onSwitchName,
}: {
  event: ShiftEvent;
  name: string;
  initial: string[];
  onSwitchName: () => void;
}) {
  const [selected, setSelected] = useState(() => new Set(initial));
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [closed, setClosed] = useState(!event.isOpen);
  const dirty = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number>(undefined);
  const latest = useRef(selected);
  latest.current = selected;
  const toast = useToast();

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current; // 一次只送一個，送完再送最新的
    if (!dirty.current) return;
    dirty.current = false;
    setSave({ kind: 'saving' });
    const p = saveAvailability(event.id, name, [...latest.current])
      .then(() => setSave({ kind: 'saved', at: new Date() }))
      .catch((err: { code?: string }) => {
        const isClosed = err?.code === 'permission-denied';
        dirty.current = !isClosed; // 截止了就不用再提醒「尚未儲存」
        if (isClosed) setClosed(true);
        setSave({ kind: 'error', closed: isClosed });
        toast(isClosed ? '檔期已截止，這次的修改沒有存到' : '儲存失敗，請檢查網路後重試', 'danger');
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = p;
    await p;
  }, [event.id, name, toast]);

  const change = (next: Set<string>) => {
    setSelected(next);
    dirty.current = true;
    setSave({ kind: 'saving' });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 600);
  };

  // 關掉分頁或切到背景前，把還沒送出的變更送出去；送不出去時提醒
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirty.current) void flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) e.preventDefault();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.body.classList.add('has-action-bar');
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.body.classList.remove('has-action-bar');
    };
  }, [flush]);

  const valid = validKeys(event);
  const count = [...selected].filter((k) => valid.has(k)).length;
  const hours = hoursOf(event, selected);

  return (
    <div className="fill-step">
      <div className="fill-who">
        <div>
          <span className="overline">填寫人</span>
          <p className="title-sm">{name}</p>
        </div>
        <button type="button" className="btn btn-sm" onClick={onSwitchName}>
          不是你？
        </button>
      </div>

      {closed ? (
        <ClosedNotice />
      ) : (
        <div className="notice" data-tone="info">
          <Info />
          <span>點擊格子即可切換有空／沒空，長按並拖曳可選整塊時段，點日期則可以整列切換。自動儲存。</span>
        </div>
      )}

      <AvailabilityGrid event={event} selected={selected} onChange={change} readOnly={closed} />

      <div className="action-bar">
        <div className="action-bar-inner">
          <p className="body-sm">
            已選 <strong className="num">{count}</strong> 格 · 共 <strong className="num">{formatHours(hours)}</strong> 小時
          </p>
          <SaveIndicator state={save} onRetry={flush} />
        </div>
      </div>
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state.kind === 'saving')
    return (
      <span className="save-state">
        <span className="spinner" /> 儲存中
      </span>
    );
  if (state.kind === 'saved')
    return (
      <span className="save-state" data-tone="success">
        <CircleCheck /> 已儲存 · <span className="num">{formatTime(state.at)}</span>
      </span>
    );
  if (state.kind === 'error')
    return state.closed ? (
      <span className="save-state" data-tone="danger">
        <CircleAlert /> 已截止，無法修改
      </span>
    ) : (
      <button type="button" className="btn btn-sm" onClick={onRetry}>
        <RotateCcw /> 重試儲存
      </button>
    );
  return null;
}
