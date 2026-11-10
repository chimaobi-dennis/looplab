import type { ISODate } from '../core/dates';
import { markNotified, pendingReminders } from '../core/reminders';
import { describeDaysLeft } from '../core/status';
import type { Item } from '../core/types';

export type ReminderPermission = 'unsupported' | NotificationPermission;

export function reminderPermission(): ReminderPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function askForReminders(): Promise<ReminderPermission> {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.requestPermission();
}

/**
 * Shows a system notification for each due reminder and returns the items
 * that changed, for the caller to persist. Does nothing without permission,
 * so reminders are not marked as delivered when nobody saw them.
 *
 * Limitation: this runs only while the app is open. Background delivery needs
 * a push server, which this local-only app does not have.
 */
export function deliverReminders(items: readonly Item[], today: ISODate): Item[] {
  if (reminderPermission() !== 'granted') return [];
  const changed: Item[] = [];
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const reminder of pendingReminders(items, today)) {
    const item = byId.get(reminder.itemId);
    if (!item) continue;
    try {
      new Notification(reminder.name, { body: describeDaysLeft(reminder.daysLeft), tag: `looplab-${item.id}` });
    } catch {
      // Some mobile browsers only allow notifications from a service worker.
      return changed;
    }
    changed.push(markNotified(item, today));
  }
  return changed;
}
