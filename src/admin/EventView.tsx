import { useEffect, useState } from 'react';
import { ArrowLeft, FileSpreadsheet, Link2 } from 'lucide-react';
import { updateEvent, watchAvailability } from '../lib/api';
import { dateRangeLabel, type Availability, type ShiftEvent } from '../lib/schedule';
import { Switch, Tabs, useToast } from '../ui/common';
import { Overview } from './Overview';
import { People } from './People';
import { Settings } from './Settings';

type Tab = 'overview' | 'people' | 'settings';

export const fillLink = (id: string) => `${location.origin}/e/${id}`;

export function EventView({
  event,
  onBack,
  onDeleted,
}: {
  event: ShiftEvent;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [people, setPeople] = useState<Availability[] | null>(null);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  useEffect(
    () =>
      watchAvailability(event.id, setPeople, () => {
        toast('讀取填寫資料失敗', 'danger');
        setPeople([]);
      }),
    [event.id, toast],
  );

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(fillLink(event.id));
      toast('已複製填寫連結');
    } catch {
      prompt('複製這個連結發給助教：', fillLink(event.id));
    }
  };

  const toggleOpen = async (open: boolean) => {
    try {
      await updateEvent(event.id, { isOpen: open });
      toast(open ? '已重新開放填寫' : '已截止填寫，助教只能查看、不能再修改');
    } catch {
      toast('更新失敗，請再試一次', 'danger');
    }
  };

  const exportExcel = async () => {
    if (!people) return;
    setExporting(true);
    try {
      const { exportWorkbook } = await import('../lib/excel');
      await exportWorkbook(event, people);
    } catch (e) {
      console.error(e);
      toast('匯出失敗，請再試一次', 'danger');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="event-view">
      <div className="event-head">
        <div className="event-head-top">
          <button className="btn btn-icon btn-ghost mobile-only" onClick={onBack} aria-label="回到檔期清單">
            <ArrowLeft />
          </button>
          <div className="event-head-title">
            <h1 className="headline-md">{event.title || '未命名檔期'}</h1>
            <p className="body-sm muted num">
              {dateRangeLabel(event.dates)} · {event.dates.length} 天 × {event.slots.length} 個時段
              {people && ` · ${people.length} 人已填寫`}
            </p>
          </div>
          <div className="event-head-actions">
            <label className="open-toggle body-sm">
              <Switch checked={event.isOpen} onChange={toggleOpen} label="開放填寫" />
              <span>開放填寫</span>
            </label>
            <button className="btn" onClick={copyLink}>
              <Link2 /> 複製填寫連結
            </button>
            <button className="btn btn-primary" onClick={exportExcel} disabled={!people || exporting}>
              {exporting ? <span className="spinner" /> : <FileSpreadsheet />}
              匯出 Excel
            </button>
          </div>
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { value: 'overview', label: '總覽' },
            { value: 'people', label: `填寫名單${people ? `（${people.length}）` : ''}` },
            { value: 'settings', label: '設定' },
          ]}
        />
      </div>

      <div className="event-body">
        {tab === 'overview' && <Overview event={event} people={people} onCopyLink={copyLink} />}
        {tab === 'people' && <People event={event} people={people} onCopyLink={copyLink} />}
        {tab === 'settings' && <Settings event={event} people={people ?? []} onDeleted={onDeleted} />}
      </div>
    </div>
  );
}
