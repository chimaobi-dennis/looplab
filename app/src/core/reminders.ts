import { daysBetween, type ISODate } from './dates';
import type { Item } from './types';

export interface Reminder {
  itemId: string;
  name: string;
  daysLeft: number;
  /** The tightest lead time that has been crossed and not yet notified. 0 means "expired". */
  lead: number;
}

/** Expiry itself counts as a final reminder even when no lead times are set. */
const EXPIRY_LEAD = 0;

function crossedLeads(item: Item, today: ISODate): number[] {
  const daysLeft = daysBetween(today, item.expiresOn);
  return [...item.leadDays, EXPIRY_LEAD].filter(
    (lead) => daysLeft <= lead && !item.notifiedLeads.includes(lead),
  );
}

/**
 * One reminder per item at most: if the app was closed while several lead
 * times passed, the user gets a single notification, not a burst.
 */
export function pendingReminders(items: readonly Item[], today: ISODate): Reminder[] {
  const reminders: Reminder[] = [];
  for (const item of items) {
    const crossed = crossedLeads(item, today);
    if (crossed.length === 0) continue;
    reminders.push({
      itemId: item.id,
      name: item.name,
      daysLeft: daysBetween(today, item.expiresOn),
      lead: Math.min(...crossed),
    });
  }
  return reminders.sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Records every crossed lead time as notified. Returns the same object when nothing changed. */
export function markNotified(item: Item, today: ISODate): Item {
  const crossed = crossedLeads(item, today);
  if (crossed.length === 0) return item;
  return { ...item, notifiedLeads: [...item.notifiedLeads, ...crossed] };
}
