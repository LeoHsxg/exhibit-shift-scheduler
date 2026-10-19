import { useState } from 'react';
import { CircleAlert, Link2, Pencil, Trash2, Users } from 'lucide-react';
import { deletePerson, renamePerson } from '../lib/api';
import { formatHours, hoursOf, normalizeName, validKeys, type Availability, type ShiftEvent } from '../lib/schedule';
import { Dialog, useToast } from '../ui/common';

// 助教自由輸入名字，難免有人打錯字或重複填。這裡可以改名（同名會合併）或刪除。

export function People({
  event,
  people,
  onCopyLink,
}: {
  event: ShiftEvent;
  people: Availability[] | null;
  onCopyLink: () => void;
}) {
  const [renaming, setRenaming] = useState<Availability | null>(null);
  const [deleting, setDeleting] = useState<Availability | null>(null);

  if (!people) return <div className="skeleton" style={{ height: 240, margin: 24 }} />;
  if (people.length === 0)
    return (
      <div className="empty">
        <Users />
        <h3 className="title-lg">還沒有人填寫</h3>
        <p>助教用填寫連結輸入名字後，就會出現在這裡。</p>
        <button className="btn btn-primary" onClick={onCopyLink}>
          <Link2 /> 複製填寫連結
        </button>
      </div>
    );

  const valid = validKeys(event);

  return (
    <div className="people">
      <table className="table">
        <thead>
          <tr>
            <th>名字</th>
            <th className="num-col">有空格數</th>
            <th className="num-col">有空時數</th>
            <th>最後更新</th>
            <th aria-label="動作" />
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.name}>
              <td className="person-name">{p.name}</td>
              <td className="num-col num">{p.slots.filter((k) => valid.has(k)).length}</td>
              <td className="num-col num">{formatHours(hoursOf(event, p.slots))}</td>
              <td className="num muted">
                {p.updatedAt
                  ? p.updatedAt.toDate().toLocaleString('zh-TW', {
                      month: 'numeric',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })
                  : '—'}
              </td>
              <td className="row-actions">
                <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setRenaming(p)} aria-label={`修改 ${p.name} 的名字`} title="改名或合併">
                  <Pencil />
                </button>
                <button className="btn btn-icon btn-sm btn-ghost" onClick={() => setDeleting(p)} aria-label={`刪除 ${p.name}`} title="刪除">
                  <Trash2 />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {renaming && <RenameDialog event={event} person={renaming} people={people} onClose={() => setRenaming(null)} />}
      {deleting && <DeleteDialog event={event} person={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function RenameDialog({
  event,
  person,
  people,
  onClose,
}: {
  event: ShiftEvent;
  person: Availability;
  people: Availability[];
  onClose: () => void;
}) {
  const [value, setValue] = useState(person.name);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { name, error } = normalizeName(value);
  const target = people.find((p) => p.name === name && p.name !== person.name);

  const submit = async () => {
    if (error || name === person.name) return onClose();
    setBusy(true);
    try {
      const merged = [...new Set([...person.slots, ...(target?.slots ?? [])])];
      await renamePerson(event.id, person.name, name, merged);
      toast(target ? `已把「${person.name}」合併到「${name}」` : `已改名為「${name}」`);
      onClose();
    } catch {
      toast('修改失敗，請再試一次', 'danger');
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="改名或合併"
      subtitle={`目前的名字：${person.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || Boolean(error)}>
            {busy && <span className="spinner" />}
            {target ? '合併' : '改名'}
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">新的名字</span>
        <input
          className="input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
          aria-invalid={Boolean(error)}
          autoFocus
        />
        {error ? (
          <span className="field-error">
            <CircleAlert />
            {error}
          </span>
        ) : target ? (
          <span className="field-hint">「{name}」已經填過了，兩邊有空的時段會合併在一起。</span>
        ) : (
          <span className="field-hint">之後助教要用新的名字才能修改自己的時段。</span>
        )}
      </label>
    </Dialog>
  );
}

function DeleteDialog({ event, person, onClose }: { event: ShiftEvent; person: Availability; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const submit = async () => {
    setBusy(true);
    try {
      await deletePerson(event.id, person.name);
      toast(`已刪除「${person.name}」填的時段`);
      onClose();
    } catch {
      toast('刪除失敗，請再試一次', 'danger');
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={`刪除「${person.name}」？`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-danger" onClick={submit} disabled={busy}>
            {busy && <span className="spinner" />}
            刪除
          </button>
        </>
      }
    >
      <p>這個人填的所有時段都會刪除，無法復原。如果只是名字打錯，用「改名或合併」比較好。</p>
    </Dialog>
  );
}
