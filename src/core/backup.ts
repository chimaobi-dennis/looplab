import { isCategoryId } from './categories';
import { isValidISODate } from './dates';
import type { Item, Renewal } from './types';

const APP_ID = 'looplab';
const VERSION = 1;

/** Backups hold item data only. Photos stay on the device; their ids are dropped on export. */
export function exportBackup(items: readonly Item[], nowISO: string): string {
  return JSON.stringify(
    { app: APP_ID, version: VERSION, exportedAt: nowISO, items: items.map((i) => ({ ...i, attachmentIds: [] })) },
    null,
    2,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveIntArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= 0);
}

function parseItem(raw: unknown, index: number): Item {
  const fail = (what: string): never => {
    throw new Error(`Item ${index + 1}: ${what}.`);
  };
  if (!isRecord(raw)) return fail('is not an object');
  const { id, name, category, expiresOn, leadDays, renewalMonths, notes, notifiedLeads, history, createdAt, updatedAt } = raw;
  if (typeof id !== 'string' || !id) return fail('has no id');
  if (typeof name !== 'string' || !name.trim()) return fail('has no name');
  if (!isCategoryId(category)) return fail('has an unknown category');
  if (typeof expiresOn !== 'string' || !isValidISODate(expiresOn)) return fail('has an invalid expiry date');
  if (!isPositiveIntArray(leadDays)) return fail('has invalid reminder days');
  if (renewalMonths !== null && !(Number.isInteger(renewalMonths) && (renewalMonths as number) > 0)) {
    return fail('has an invalid renewal period');
  }
  const renewals: Renewal[] = [];
  if (history !== undefined) {
    if (!Array.isArray(history)) return fail('has an invalid history');
    for (const entry of history) {
      if (
        !isRecord(entry) ||
        typeof entry.renewedOn !== 'string' ||
        !isValidISODate(entry.renewedOn) ||
        typeof entry.previousExpiry !== 'string' ||
        !isValidISODate(entry.previousExpiry)
      ) {
        return fail('has an invalid history entry');
      }
      renewals.push({ renewedOn: entry.renewedOn, previousExpiry: entry.previousExpiry });
    }
  }
  const fallbackTime = new Date(0).toISOString();
  return {
    id,
    name: name.trim(),
    category,
    expiresOn,
    leadDays: [...new Set(leadDays)].sort((a, b) => b - a),
    renewalMonths: renewalMonths as number | null,
    notes: typeof notes === 'string' ? notes : '',
    attachmentIds: [],
    notifiedLeads: isPositiveIntArray(notifiedLeads) ? notifiedLeads : [],
    history: renewals,
    createdAt: typeof createdAt === 'string' ? createdAt : fallbackTime,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : fallbackTime,
  };
}

/** Validates a backup file fully before returning anything, so a bad file never half-imports. */
export function parseBackup(text: string): Item[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isRecord(data) || data.app !== APP_ID) throw new Error('This is not a LoopLab backup file.');
  if (data.version !== VERSION) throw new Error(`Unsupported backup version: ${String(data.version)}.`);
  if (!Array.isArray(data.items)) throw new Error('The backup contains no item list.');
  const items = data.items.map(parseItem);
  if (new Set(items.map((i) => i.id)).size !== items.length) throw new Error('The backup contains duplicate ids.');
  return items;
}
