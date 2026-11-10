import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CATEGORIES, getCategory, isCategoryId } from '../core/categories';
import { formatDate, isValidISODate, type ISODate } from '../core/dates';
import {
  createItem,
  draftFromItem,
  emptyDraft,
  parseDraft,
  presetFields,
  updateItem,
  type Draft,
  type DraftErrors,
} from '../core/draft';
import { renewItem, suggestNextExpiry } from '../core/renew';
import { getStatus } from '../core/status';
import type { Attachment, Item } from '../core/types';
import { getAttachments } from '../storage/db';

interface Props {
  /** null when adding a new item. */
  item: Item | null;
  today: ISODate;
  onSave: (item: Item, added: Attachment[], removedIds: string[]) => Promise<void>;
  onDelete: (item: Item) => Promise<void>;
  onClose: () => void;
}

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export function ItemDialog({ item, today, onSave, onDelete, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Draft>(() => (item ? draftFromItem(item) : emptyDraft()));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Photo edits are staged and only written when the form is saved, so Cancel discards them.
  const [stored, setStored] = useState<Attachment[]>([]);
  const [added, setAdded] = useState<Attachment[]>([]);
  const [removedIds, setRemovedIds] = useState<string[]>([]);

  const [renewing, setRenewing] = useState(false);
  const [renewDate, setRenewDate] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    if (!item) return;
    let cancelled = false;
    getAttachments(item.id).then(
      (loaded) => !cancelled && setStored(loaded),
      () => !cancelled && setFailure('Could not load the photos for this item.'),
    );
    return () => {
      cancelled = true;
    };
  }, [item]);

  const itemId = useMemo(() => item?.id ?? crypto.randomUUID(), [item]);
  const photos = [...stored.filter((a) => !removedIds.includes(a.id)), ...added];
  const category = getCategory(draft.category);
  const status = item ? getStatus(item, today) : null;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const accepted: Attachment[] = [];
    for (const file of files) {
      if (file.size > MAX_PHOTO_BYTES) {
        setFailure(`"${file.name}" is larger than 15 MB and was skipped.`);
        continue;
      }
      accepted.push({ id: crypto.randomUUID(), itemId, name: file.name, type: file.type, blob: file });
    }
    setAdded((current) => [...current, ...accepted]);
  }

  function removePhoto(id: string) {
    if (added.some((a) => a.id === id)) setAdded((current) => current.filter((a) => a.id !== id));
    else setRemovedIds((current) => [...current, id]);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setFailure(null);
    try {
      await action();
      onClose();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Could not save. Your device storage may be full.');
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseDraft(draft);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    const now = new Date().toISOString();
    const base = item ? updateItem(item, parsed.value, now) : createItem(parsed.value, itemId, now);
    const next: Item = { ...base, attachmentIds: photos.map((p) => p.id) };
    void run(() => onSave(next, added, removedIds));
  }

  function startRenewing() {
    if (!item) return;
    setRenewDate(suggestNextExpiry(item, today) ?? '');
    setRenewing(true);
  }

  function confirmRenewal() {
    if (!item) return;
    if (!isValidISODate(renewDate)) {
      setFailure('Enter the new expiry date.');
      return;
    }
    let renewed: Item;
    try {
      renewed = renewItem(item, renewDate, today, new Date().toISOString());
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That date does not work.');
      return;
    }
    void run(() => onSave(renewed, [], []));
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-labelledby="dialog-title">
      <form onSubmit={submit} noValidate>
        <h2 id="dialog-title">{item ? 'Edit item' : 'Add item'}</h2>

        {item && status && (
          <div className={`renew-box ${status.level}`}>
            {!renewing ? (
              <>
                <span>
                  {status.nextReminderOn
                    ? `Next reminder ${formatDate(status.nextReminderOn)}.`
                    : status.level === 'expired'
                      ? 'This has expired.'
                      : 'No further reminders before it expires.'}
                </span>
                <button type="button" className="btn" onClick={startRenewing}>
                  Mark as renewed
                </button>
              </>
            ) : (
              <>
                <label className="inline">
                  New expiry date
                  <input type="date" value={renewDate} onChange={(e) => setRenewDate(e.target.value)} autoFocus />
                </label>
                <div className="row">
                  <button type="button" className="btn primary" onClick={confirmRenewal} disabled={busy}>
                    Save renewal
                  </button>
                  <button type="button" className="btn" onClick={() => setRenewing(false)}>
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <Field label="Category" error={errors.category}>
          <select
            value={draft.category}
            onChange={(e) => {
              const id = e.target.value;
              // Switching category re-applies its preset; that is the whole point of choosing one.
              if (isCategoryId(id)) setDraft((current) => ({ ...current, ...presetFields(id) }));
            }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </Field>
        {category.hint && <p className="hint">{category.hint}</p>}

        <Field label="Name" error={errors.name}>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder={`e.g. ${category.label}`}
            maxLength={80}
            autoFocus={!item}
          />
        </Field>

        <Field label="Expires on" error={errors.expiresOn}>
          <input type="date" value={draft.expiresOn} onChange={(e) => set('expiresOn', e.target.value)} />
        </Field>

        <Field label="Remind me this many days before" error={errors.leadDays}>
          <input
            type="text"
            inputMode="numeric"
            value={draft.leadDays}
            onChange={(e) => set('leadDays', e.target.value)}
            placeholder="30, 7"
          />
        </Field>

        <Field label="Renews every (months) — leave empty if it does not recur" error={errors.renewalMonths}>
          <input
            type="text"
            inputMode="numeric"
            value={draft.renewalMonths}
            onChange={(e) => set('renewalMonths', e.target.value)}
          />
        </Field>

        <Field label="Notes">
          <textarea
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            placeholder="Policy number, where the document is kept…"
          />
        </Field>

        <div className="field">
          <span className="label">Photos</span>
          <div className="photos">
            {photos.map((photo) => (
              <Thumbnail key={photo.id} attachment={photo} onRemove={() => removePhoto(photo.id)} />
            ))}
            <label className="add-photo">
              + Photo
              <input
                type="file"
                accept="image/*"
                multiple
                className="visually-hidden"
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {item && item.history.length > 0 && (
          <p className="hint">
            Renewed {item.history.length} {item.history.length === 1 ? 'time' : 'times'}, last on{' '}
            {formatDate(item.history[item.history.length - 1]!.renewedOn)}.
          </p>
        )}

        {failure && (
          <p className="banner error" role="alert">
            {failure}
          </p>
        )}

        <div className="actions">
          {item &&
            (confirmingDelete ? (
              <button type="button" className="btn danger" disabled={busy} onClick={() => void run(() => onDelete(item))}>
                Really delete
              </button>
            ) : (
              <button type="button" className="link danger" onClick={() => setConfirmingDelete(true)}>
                Delete
              </button>
            ))}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {item ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

function Thumbnail({ attachment, onRemove }: { attachment: Attachment; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(attachment.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment.blob]);

  return (
    <span className="thumb">
      {url && (
        <a href={url} target="_blank" rel="noreferrer" title={`Open ${attachment.name}`}>
          <img src={url} alt={attachment.name} />
        </a>
      )}
      <button type="button" aria-label={`Remove ${attachment.name}`} onClick={onRemove}>
        ×
      </button>
    </span>
  );
}
