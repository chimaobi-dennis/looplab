import { useEffect, useMemo, useRef, useState } from 'react';
import { exportBackup, parseBackup } from '../core/backup';
import { getCategory } from '../core/categories';
import { formatDate, type ISODate } from '../core/dates';
import { describeDaysLeft, getStatus, groupByBucket, type Level } from '../core/status';
import type { Item } from '../core/types';
import { ItemDialog } from './ItemDialog';
import { askForReminders, deliverReminders, reminderPermission } from './notify';
import { useItems } from './useItems';
import { useToday } from './useToday';

type Editing = { mode: 'new' } | { mode: 'edit'; item: Item } | null;

const LEVEL_LABEL: Record<Level, string> = { expired: 'Expired', urgent: 'Act now', soon: 'Coming up', ok: 'Fine' };

export function App() {
  const { items, state, save, saveMany, remove } = useItems();
  const today = useToday();
  const [editing, setEditing] = useState<Editing>(null);
  const [permission, setPermission] = useState(reminderPermission);
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => groupByBucket(items, today), [items, today]);
  const counts = useMemo(() => {
    const tally: Record<Level, number> = { expired: 0, urgent: 0, soon: 0, ok: 0 };
    for (const item of items) tally[getStatus(item, today).level] += 1;
    return tally;
  }, [items, today]);

  // Deliver due reminders whenever the data, the day or the permission changes.
  useEffect(() => {
    if (state.status !== 'ready' || permission !== 'granted') return;
    const changed = deliverReminders(items, today);
    if (changed.length > 0) void saveMany(changed);
  }, [items, today, permission, state.status, saveMany]);

  async function enableReminders() {
    const result = await askForReminders();
    setPermission(result);
    if (result === 'denied') {
      setMessage({ kind: 'error', text: 'Notifications are blocked for this site. Allow them in your browser settings.' });
    }
  }

  function downloadBackup() {
    const url = URL.createObjectURL(new Blob([exportBackup(items, new Date().toISOString())], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `looplab-backup-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importBackup(file: File) {
    try {
      const imported = parseBackup(await file.text());
      // Backups carry no photos, so keep the photo links of items already on this device.
      const existing = new Map(items.map((item) => [item.id, item]));
      await saveMany(imported.map((item) => ({ ...item, attachmentIds: existing.get(item.id)?.attachmentIds ?? [] })));
      setMessage({ kind: 'info', text: `Imported ${imported.length} ${imported.length === 1 ? 'item' : 'items'}.` });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Import failed.' });
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>LoopLab</h1>
          <p className="muted">{formatDate(today)}</p>
        </div>
        <button className="btn primary" onClick={() => setEditing({ mode: 'new' })}>
          + Add item
        </button>
      </header>

      {message && (
        <p className={`banner ${message.kind}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          <span>{message.text}</span>
          <button className="link" onClick={() => setMessage(null)}>
            Dismiss
          </button>
        </p>
      )}

      {permission === 'default' && items.length > 0 && (
        <p className="banner info">
          <span>Get a notification when a deadline is close. Works while the app is open or installed.</span>
          <button className="link" onClick={() => void enableReminders()}>
            Turn on reminders
          </button>
        </p>
      )}

      {state.status === 'loading' && <p className="muted">Loading…</p>}
      {state.status === 'error' && (
        <p className="banner error" role="alert">
          Could not open local storage: {state.message} Private browsing windows often block it.
        </p>
      )}

      {state.status === 'ready' && items.length === 0 && (
        <section className="empty">
          <h2>Nothing tracked yet</h2>
          <p>
            Add the things that expire so rarely you forget them: passport, licence, insurance, car service, warranties,
            subscriptions. LoopLab picks sensible reminder times for each.
          </p>
          <button className="btn primary" onClick={() => setEditing({ mode: 'new' })}>
            Add your first item
          </button>
        </section>
      )}

      {items.length > 0 && (
        <>
          <ul className="summary" aria-label="Summary">
            {(['expired', 'urgent', 'soon', 'ok'] as const).map((level) => (
              <li key={level} className={`stat ${level}`}>
                <strong>{counts[level]}</strong>
                <span>{LEVEL_LABEL[level]}</span>
              </li>
            ))}
          </ul>

          {groups.map((group) => (
            <section key={group.id} className="group">
              <h2>
                {group.label} <span className="count">{group.items.length}</span>
              </h2>
              <ul className="cards">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <ItemCard item={item} today={today} onOpen={() => setEditing({ mode: 'edit', item })} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      <footer className="footer">
        <span className="muted">Stored only on this device.</span>
        <button className="link" onClick={downloadBackup} disabled={items.length === 0}>
          Export backup
        </button>
        <button className="link" onClick={() => fileInput.current?.click()}>
          Import backup
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importBackup(file);
          }}
        />
      </footer>

      {editing && (
        <ItemDialog
          key={editing.mode === 'edit' ? editing.item.id : 'new'}
          item={editing.mode === 'edit' ? editing.item : null}
          today={today}
          onSave={save}
          onDelete={remove}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ItemCard({ item, today, onOpen }: { item: Item; today: ISODate; onOpen: () => void }) {
  const status = getStatus(item, today);
  const category = getCategory(item.category);
  return (
    <button className={`card ${status.level}`} onClick={onOpen}>
      <span className="emoji" aria-hidden="true">
        {category.emoji}
      </span>
      <span className="card-main">
        <span className="card-name">{item.name}</span>
        <span className="muted">
          {category.label} · {formatDate(item.expiresOn)}
          {item.attachmentIds.length > 0 && ` · 📎 ${item.attachmentIds.length}`}
        </span>
      </span>
      <span className={`pill ${status.level}`}>{describeDaysLeft(status.daysLeft)}</span>
    </button>
  );
}
