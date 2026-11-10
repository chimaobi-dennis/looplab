import { addMonths, daysBetween, isValidISODate, type ISODate } from './dates';
import type { Item } from './types';

/**
 * Suggested expiry after renewing: the next cycle boundary that lies in the
 * future. Only a starting point — a passport renewed late runs from the issue
 * date, not the old expiry — so the UI lets the user edit it.
 */
export function suggestNextExpiry(
  item: Pick<Item, 'expiresOn' | 'renewalMonths'>,
  today: ISODate,
): ISODate | null {
  if (item.renewalMonths === null || item.renewalMonths <= 0) return null;
  let cycles = 1;
  let next = addMonths(item.expiresOn, item.renewalMonths);
  // Step from the original date each time so month-end clamping does not drift (31 → 28 → 28).
  while (daysBetween(today, next) <= 0) {
    cycles += 1;
    next = addMonths(item.expiresOn, item.renewalMonths * cycles);
  }
  return next;
}

export function renewItem(item: Item, newExpiry: ISODate, today: ISODate, nowISO: string): Item {
  if (!isValidISODate(newExpiry)) throw new RangeError(`Invalid date: ${newExpiry}`);
  if (daysBetween(item.expiresOn, newExpiry) <= 0) {
    throw new RangeError('The new expiry date must be later than the current one.');
  }
  return {
    ...item,
    expiresOn: newExpiry,
    notifiedLeads: [],
    history: [...item.history, { renewedOn: today, previousExpiry: item.expiresOn }],
    updatedAt: nowISO,
  };
}
