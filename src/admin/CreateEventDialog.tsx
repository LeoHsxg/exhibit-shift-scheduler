import { useState, type FormEvent } from 'react';
import { CircleAlert } from 'lucide-react';
import { createEvent } from '../lib/api';
import { DEFAULT_SLOTS, toIso } from '../lib/schedule';
import { Dialog, useToast } from '../ui/common';
import { DateEditor, dateDraftError, datesFromDraft, type DateDraft } from './editors';

function nextMonday(): Date {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d;
}

export function CreateEventDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [dates, setDates] = useState<DateDraft>(() => {
    const start = nextMonday();
    const end = new Date(start);
    end.setDate(end.getDate() + 11);
    return { start: toIso(start), end: toIso(end), weekdays: [1, 2, 3, 4, 5], excluded: [] };
  });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const titleError = title.trim() ? undefined : '請輸入檔期名稱，例如「2026 秋季展覽」';
  const datesError = dateDraftError(dates);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (titleError || datesError) return;
    setBusy(true);
    try {
      const id = await createEvent({ title: title.trim(), dates: datesFromDraft(dates), slots: DEFAULT_SLOTS });
      toast('已建立檔期，複製填寫連結發給助教就可以開始填');
      onCreated(id);
    } catch {
      toast('建立失敗，請再試一次', 'danger');
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="新增檔期"
      subtitle="時段預設帶入 12:00–18:00 的六個時段，建立後可以在「設定」調整"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            取消
          </button>
          <button type="submit" form="create-event" className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" />}
            建立檔期
          </button>
        </>
      }
    >
      <form id="create-event" className="form-stack" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">檔期名稱</span>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：2026 秋季展覽"
            aria-invalid={submitted && Boolean(titleError)}
            autoFocus
          />
          {submitted && titleError && (
            <span className="field-error">
              <CircleAlert />
              {titleError}
            </span>
          )}
        </label>
        <DateEditor value={dates} onChange={setDates} />
        {submitted && datesError && (
          <span className="field-error">
            <CircleAlert />
            {datesError}
          </span>
        )}
      </form>
    </Dialog>
  );
}
