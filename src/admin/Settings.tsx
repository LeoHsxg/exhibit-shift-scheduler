import { useMemo, useState } from 'react';
import { CircleAlert, Info } from 'lucide-react';
import { deleteEvent, updateEvent } from '../lib/api';
import { slotKey, type Availability, type ShiftEvent, type Slot } from '../lib/schedule';
import { Dialog, useToast } from '../ui/common';
import { DateEditor, SlotEditor, dateDraftError, dateDraftFrom, datesFromDraft, slotsError } from './editors';

export function Settings({
  event,
  people,
  onDeleted,
}: {
  event: ShiftEvent;
  people: Availability[];
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(event.title);
  const [dates, setDates] = useState(() => dateDraftFrom(event.dates));
  const [slots, setSlots] = useState<Slot[]>(event.slots);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const toast = useToast();

  const nextDates = useMemo(() => datesFromDraft(dates), [dates]);
  const titleError = title.trim() ? undefined : '請輸入檔期名稱';
  const datesError = dateDraftError(dates);
  const slotError = slotsError(slots);
  const dirty =
    title.trim() !== event.title ||
    JSON.stringify(nextDates) !== JSON.stringify(event.dates) ||
    JSON.stringify(slots) !== JSON.stringify(event.slots);

  // 改動後，有多少人填過的格子會消失（刪掉的日期、刪掉或改了開始時間的時段）
  const lost = useMemo(() => {
    const keep = new Set<string>();
    for (const d of nextDates) for (const s of slots) keep.add(slotKey(d, s));
    return people.filter((p) => p.slots.some((k) => event.dates.includes(k.split('_')[0]) && !keep.has(k))).length;
  }, [nextDates, slots, people, event.dates]);

  const save = async () => {
    setSubmitted(true);
    if (titleError || datesError || slotError) return;
    setBusy(true);
    try {
      await updateEvent(event.id, { title: title.trim(), dates: nextDates, slots });
      toast('已儲存設定');
      setSubmitted(false);
    } catch {
      toast('儲存失敗，請再試一次', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings">
      <section className="settings-section">
        <h2 className="title-lg">基本資料</h2>
        <label className="field">
          <span className="field-label">檔期名稱</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={submitted && Boolean(titleError)} />
          {submitted && titleError && <ErrorText>{titleError}</ErrorText>}
        </label>
      </section>

      <section className="settings-section">
        <h2 className="title-lg">日期</h2>
        <DateEditor value={dates} onChange={setDates} />
        {submitted && datesError && <ErrorText>{datesError}</ErrorText>}
      </section>

      <section className="settings-section">
        <h2 className="title-lg">時段</h2>
        <p className="body-sm muted">時數會用在 Excel 的統計裡，例如 12:00–13:10 算 1.17 小時。</p>
        <SlotEditor value={slots} onChange={setSlots} />
        {submitted && slotError && <ErrorText>{slotError}</ErrorText>}
      </section>

      <div className="settings-save">
        {dirty && lost > 0 && (
          <div className="notice" data-tone="warning">
            <Info />
            <span>
              有 <strong className="num">{lost}</strong> 人填過的格子在這次修改後不會顯示（刪掉的日期或時段、改了開始時間的時段）。資料沒有刪除，改回來就會恢復；只改結束時間不受影響。
            </span>
          </div>
        )}
        <div className="settings-save-row">
          <span className="body-sm muted">{dirty ? '有尚未儲存的修改' : '所有修改都已儲存'}</span>
          <button className="btn btn-primary" onClick={save} disabled={!dirty || busy}>
            {busy && <span className="spinner" />}
            儲存設定
          </button>
        </div>
      </div>

      <section className="settings-section danger-zone">
        <h2 className="title-lg">刪除檔期</h2>
        <p className="body-sm muted">檔期和所有人填的資料都會刪除，無法復原。建議先匯出 Excel 留存。</p>
        <div>
          <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
            刪除這個檔期
          </button>
        </div>
      </section>

      {confirmDelete && (
        <DeleteEventDialog event={event} people={people} onClose={() => setConfirmDelete(false)} onDeleted={onDeleted} />
      )}
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <span className="field-error">
      <CircleAlert />
      {children}
    </span>
  );
}

function DeleteEventDialog({
  event,
  people,
  onClose,
  onDeleted,
}: {
  event: ShiftEvent;
  people: Availability[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async () => {
    setBusy(true);
    try {
      await deleteEvent(
        event.id,
        people.map((p) => p.name),
      );
      toast(`已刪除「${event.title}」`);
      onDeleted();
    } catch {
      toast('刪除失敗，請再試一次', 'danger');
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="刪除檔期？"
      subtitle={event.title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-danger" onClick={submit} disabled={busy || typed.trim() !== event.title}>
            {busy && <span className="spinner" />}
            永久刪除
          </button>
        </>
      }
    >
      <p>
        會一併刪除 <strong className="num">{people.length}</strong> 人填的資料，無法復原。
      </p>
      <label className="field">
        <span className="field-label">輸入檔期名稱「{event.title}」確認</span>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
      </label>
    </Dialog>
  );
}
