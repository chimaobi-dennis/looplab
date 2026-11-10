import { addDays, daysBetween, type ISODate } from './dates';
import type { Item } from './types';

export type Level = 'expired' | 'urgent' | 'soon' | 'ok';

export interface Status {
  /** Negative once the item has expired. */
  daysLeft: number;
  level: Level;
  /** Next date a reminder is due, or null when none remain. */
  nextReminderOn: ISODate | null;
}

export function getStatus(item: Pick<Item, 'expiresOn' | 'leadDays'>, today: ISODate): Status {
  const daysLeft = daysBetween(today, item.expiresOn);
  const leads = item.leadDays;

  let level: Level = 'ok';
  if (daysLeft < 0) level = 'expired';
  else if (leads.length > 0 && daysLeft <= Math.min(...leads)) level = 'urgent';
  else if (leads.length > 0 && daysLeft <= Math.max(...leads)) level = 'soon';

  // The closest lead time still ahead of today.
  const upcoming = leads.filter((lead) => lead < daysLeft);
  const nextReminderOn = upcoming.length > 0 ? addDays(item.expiresOn, -Math.max(...upcoming)) : null;

  return { daysLeft, level, nextReminderOn };
}

export const BUCKETS = [
  { id: 'overdue', label: 'Expired' },
  { id: 'month', label: 'Next 30 days' },
  { id: 'quarter', label: 'Next 90 days' },
  { id: 'year', label: 'Within a year' },
  { id: 'later', label: 'Later' },
] as const;

export type BucketId = (typeof BUCKETS)[number]['id'];

export function bucketFor(daysLeft: number): BucketId {
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= 30) return 'month';
  if (daysLeft <= 90) return 'quarter';
  if (daysLeft <= 365) return 'year';
  return 'later';
}

/** Groups items into timeline buckets, soonest first within each. Empty buckets are omitted. */
export function groupByBucket<T extends Pick<Item, 'expiresOn'>>(
  items: readonly T[],
  today: ISODate,
): { id: BucketId; label: string; items: T[] }[] {
  const sorted = [...items].sort((a, b) => daysBetween(b.expiresOn, a.expiresOn));
  return BUCKETS.map((bucket) => ({
    ...bucket,
    items: sorted.filter((item) => bucketFor(daysBetween(today, item.expiresOn)) === bucket.id),
  })).filter((group) => group.items.length > 0);
}

export function describeDaysLeft(daysLeft: number): string {
  if (daysLeft === 0) return 'Expires today';
  if (daysLeft === 1) return 'Expires tomorrow';
  if (daysLeft === -1) return 'Expired yesterday';
  const abs = Math.abs(daysLeft);
  const span =
    abs < 60 ? `${abs} days` : abs < 730 ? `${Math.round(abs / 30.44)} months` : `${(abs / 365.25).toFixed(1)} years`;
  return daysLeft < 0 ? `Expired ${span} ago` : `${span} left`;
}
