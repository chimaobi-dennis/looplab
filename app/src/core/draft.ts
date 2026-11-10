import { getCategory, isCategoryId, type CategoryId } from './categories';
import { isValidISODate } from './dates';
import type { Item } from './types';

/** Form state: everything is a string because that is what inputs hold. */
export interface Draft {
  name: string;
  category: CategoryId;
  expiresOn: string;
  leadDays: string;
  renewalMonths: string;
  notes: string;
}

export type DraftErrors = Partial<Record<keyof Draft, string>>;

const MAX_LEAD_DAYS = 3650;

export function emptyDraft(category: CategoryId = 'other'): Draft {
  return { name: '', expiresOn: '', notes: '', ...presetFields(category) };
}

/** The fields a category preset controls. Used when the user switches category. */
export function presetFields(category: CategoryId): Pick<Draft, 'category' | 'leadDays' | 'renewalMonths'> {
  const preset = getCategory(category);
  return {
    category,
    leadDays: preset.leadDays.join(', '),
    renewalMonths: preset.renewalMonths === null ? '' : String(preset.renewalMonths),
  };
}

export function draftFromItem(item: Item): Draft {
  return {
    name: item.name,
    category: item.category,
    expiresOn: item.expiresOn,
    leadDays: item.leadDays.join(', '),
    renewalMonths: item.renewalMonths === null ? '' : String(item.renewalMonths),
    notes: item.notes,
  };
}

/** Parses "90, 30 7" into [90, 30, 7]. Returns null when any entry is not a whole number of days in range. */
export function parseLeadDays(text: string): number[] | null {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  const days = new Set<number>();
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const n = Number(part);
    if (n < 1 || n > MAX_LEAD_DAYS) return null;
    days.add(n);
  }
  return [...days].sort((a, b) => b - a);
}

export type ParsedDraft = Pick<Item, 'name' | 'category' | 'expiresOn' | 'leadDays' | 'renewalMonths' | 'notes'>;

export function parseDraft(draft: Draft): { ok: true; value: ParsedDraft } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Give it a name you will recognise.';
  if (!isCategoryId(draft.category)) errors.category = 'Pick a category.';
  if (!isValidISODate(draft.expiresOn)) errors.expiresOn = 'Enter the expiry date.';

  const leadDays = parseLeadDays(draft.leadDays);
  if (leadDays === null) errors.leadDays = `Use whole days between 1 and ${MAX_LEAD_DAYS}, separated by commas.`;

  let renewalMonths: number | null = null;
  const months = draft.renewalMonths.trim();
  if (months) {
    if (!/^\d+$/.test(months) || Number(months) < 1 || Number(months) > 600) {
      errors.renewalMonths = 'Use a whole number of months, or leave empty.';
    } else {
      renewalMonths = Number(months);
    }
  }

  if (Object.keys(errors).length > 0 || leadDays === null) return { ok: false, errors };
  return {
    ok: true,
    value: { name, category: draft.category, expiresOn: draft.expiresOn, leadDays, renewalMonths, notes: draft.notes.trim() },
  };
}

export function createItem(fields: ParsedDraft, id: string, nowISO: string): Item {
  return { ...fields, id, attachmentIds: [], notifiedLeads: [], history: [], createdAt: nowISO, updatedAt: nowISO };
}

/**
 * Applies edited fields. Changing the date or the lead times starts the
 * reminder cycle over, otherwise a corrected date would stay silent.
 */
export function updateItem(item: Item, fields: ParsedDraft, nowISO: string): Item {
  const scheduleChanged =
    fields.expiresOn !== item.expiresOn || fields.leadDays.join() !== item.leadDays.join();
  return {
    ...item,
    ...fields,
    notifiedLeads: scheduleChanged ? [] : item.notifiedLeads,
    updatedAt: nowISO,
  };
}
