import { describe, expect, it } from 'vitest';
import { exportBackup, parseBackup } from './backup';
import { CATEGORIES } from './categories';
import { addDays, addMonths, daysBetween, isValidISODate, todayISO } from './dates';
import { createItem, emptyDraft, parseDraft, parseLeadDays, presetFields, updateItem } from './draft';
import { markNotified, pendingReminders } from './reminders';
import { renewItem, suggestNextExpiry } from './renew';
import { bucketFor, describeDaysLeft, getStatus, groupByBucket } from './status';
import type { Item } from './types';

const NOW = '2026-11-10T09:00:00.000Z';
const TODAY = '2026-11-10';

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 'a',
    name: 'Car insurance',
    category: 'insurance',
    expiresOn: '2026-12-10',
    leadDays: [30, 14, 3],
    renewalMonths: 12,
    notes: '',
    attachmentIds: [],
    notifiedLeads: [],
    history: [],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe('dates', () => {
  it('rejects malformed and impossible dates', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2026-02-30')).toBe(false);
    expect(isValidISODate('2026-2-3')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });

  it('counts days across a DST change and a leap day', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-11-10', '2026-11-09')).toBe(-1);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('clamps month ends when adding months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonths('2026-11-10', 120)).toBe('2036-11-10');
  });

  it('uses the local calendar day for today', () => {
    expect(todayISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('status', () => {
  it('derives the level from the lead times', () => {
    expect(getStatus(item({ expiresOn: '2026-11-09' }), TODAY).level).toBe('expired');
    expect(getStatus(item({ expiresOn: '2026-11-10' }), TODAY).level).toBe('urgent');
    expect(getStatus(item({ expiresOn: '2026-11-13' }), TODAY).level).toBe('urgent');
    expect(getStatus(item({ expiresOn: '2026-11-14' }), TODAY).level).toBe('soon');
    expect(getStatus(item({ expiresOn: '2026-12-10' }), TODAY).level).toBe('soon');
    expect(getStatus(item({ expiresOn: '2026-12-11' }), TODAY).level).toBe('ok');
    expect(getStatus(item({ leadDays: [], expiresOn: '2026-11-11' }), TODAY).level).toBe('ok');
  });

  it('reports the next reminder still ahead', () => {
    expect(getStatus(item({ expiresOn: '2027-06-01' }), TODAY).nextReminderOn).toBe('2027-05-02');
    // 30 days left: the 30-day reminder is due today, so the next one is the 14-day.
    expect(getStatus(item(), TODAY).nextReminderOn).toBe('2026-11-26');
    expect(getStatus(item({ expiresOn: '2026-11-12' }), TODAY).nextReminderOn).toBeNull();
  });

  it('buckets on the boundaries', () => {
    expect([-1, 0, 30, 31, 90, 91, 365, 366].map(bucketFor)).toEqual([
      'overdue', 'month', 'month', 'quarter', 'quarter', 'year', 'year', 'later',
    ]);
  });

  it('groups soonest first and drops empty buckets', () => {
    const groups = groupByBucket(
      [item({ id: 'late', expiresOn: '2026-12-01' }), item({ id: 'early', expiresOn: '2026-11-15' }), item({ id: 'far', expiresOn: '2030-01-01' })],
      TODAY,
    );
    expect(groups.map((g) => g.id)).toEqual(['month', 'later']);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['early', 'late']);
  });

  it('describes time left in words', () => {
    expect(describeDaysLeft(0)).toBe('Expires today');
    expect(describeDaysLeft(12)).toBe('12 days left');
    expect(describeDaysLeft(-3)).toBe('Expired 3 days ago');
    expect(describeDaysLeft(183)).toBe('6 months left');
    expect(describeDaysLeft(3650)).toBe('10.0 years left');
  });
});

describe('reminders', () => {
  it('stays quiet before the first lead time', () => {
    expect(pendingReminders([item({ expiresOn: '2027-06-01' })], TODAY)).toEqual([]);
  });

  it('fires once per crossed lead time', () => {
    const due = item(); // exactly 30 days left
    expect(pendingReminders([due], TODAY)).toMatchObject([{ itemId: 'a', lead: 30, daysLeft: 30 }]);
    const notified = markNotified(due, TODAY);
    expect(notified.notifiedLeads).toEqual([30]);
    expect(pendingReminders([notified], TODAY)).toEqual([]);
    expect(pendingReminders([notified], '2026-11-26')).toMatchObject([{ lead: 14 }]);
  });

  it('collapses several missed lead times into one reminder', () => {
    const missed = item({ expiresOn: '2026-11-12' }); // 2 days left, nothing notified yet
    const reminders = pendingReminders([missed], TODAY);
    expect(reminders).toHaveLength(1);
    expect(reminders[0]?.lead).toBe(3);
    expect(markNotified(missed, TODAY).notifiedLeads.sort((a, b) => a - b)).toEqual([3, 14, 30]);
  });

  it('reminds on expiry even with no lead times, exactly once', () => {
    const bare = item({ leadDays: [], expiresOn: TODAY });
    expect(pendingReminders([bare], TODAY)).toMatchObject([{ lead: 0 }]);
    expect(pendingReminders([markNotified(bare, TODAY)], addDays(TODAY, 5))).toEqual([]);
  });

  it('returns the same object when nothing is due', () => {
    const quiet = item({ expiresOn: '2027-06-01' });
    expect(markNotified(quiet, TODAY)).toBe(quiet);
  });
});

describe('renewal', () => {
  it('suggests the next cycle in the future', () => {
    expect(suggestNextExpiry(item(), TODAY)).toBe('2027-12-10');
    expect(suggestNextExpiry(item({ expiresOn: '2024-01-31', renewalMonths: 1 }), '2024-03-15')).toBe('2024-03-31');
    expect(suggestNextExpiry(item({ renewalMonths: null }), TODAY)).toBeNull();
  });

  it('rolls forward, records history and resets reminders', () => {
    const renewed = renewItem(item({ notifiedLeads: [30, 14] }), '2027-12-10', TODAY, NOW);
    expect(renewed.expiresOn).toBe('2027-12-10');
    expect(renewed.notifiedLeads).toEqual([]);
    expect(renewed.history).toEqual([{ renewedOn: TODAY, previousExpiry: '2026-12-10' }]);
  });

  it('refuses a date that is not later', () => {
    expect(() => renewItem(item(), '2026-12-10', TODAY, NOW)).toThrow(/later/);
    expect(() => renewItem(item(), 'nope', TODAY, NOW)).toThrow(/Invalid/);
  });
});

describe('drafts', () => {
  it('parses reminder days leniently but strictly on content', () => {
    expect(parseLeadDays('7, 90 30;30')).toEqual([90, 30, 7]);
    expect(parseLeadDays('')).toEqual([]);
    expect(parseLeadDays('30, soon')).toBeNull();
    expect(parseLeadDays('0')).toBeNull();
    expect(parseLeadDays('1.5')).toBeNull();
  });

  it('fills lead times from the category preset', () => {
    expect(presetFields('passport')).toEqual({ category: 'passport', leadDays: '270, 180, 90', renewalMonths: '120' });
    expect(presetFields('warranty').renewalMonths).toBe('');
  });

  it('reports every field error at once', () => {
    const result = parseDraft({ ...emptyDraft(), leadDays: 'x', renewalMonths: '-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['expiresOn', 'leadDays', 'name', 'renewalMonths']);
  });

  it('creates an item from a valid draft', () => {
    const result = parseDraft({ ...emptyDraft('passport'), name: '  My passport ', expiresOn: '2030-05-01' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(createItem(result.value, 'id1', NOW)).toMatchObject({
      id: 'id1', name: 'My passport', leadDays: [270, 180, 90], renewalMonths: 120, notifiedLeads: [],
    });
  });

  it('restarts reminders only when the schedule changes', () => {
    const base = item({ notifiedLeads: [30] });
    const same = { name: 'Renamed', category: base.category, expiresOn: base.expiresOn, leadDays: base.leadDays, renewalMonths: 12, notes: '' };
    expect(updateItem(base, same, NOW).notifiedLeads).toEqual([30]);
    expect(updateItem(base, { ...same, expiresOn: '2026-12-20' }, NOW).notifiedLeads).toEqual([]);
  });

  it('gives every category sorted, positive lead times', () => {
    for (const c of CATEGORIES) {
      expect([...c.leadDays].sort((a, b) => b - a)).toEqual([...c.leadDays]);
      expect(c.leadDays.every((d) => d > 0)).toBe(true);
    }
  });
});

describe('backup', () => {
  it('round-trips items and drops photo references', () => {
    const original = item({ attachmentIds: ['p1'], history: [{ renewedOn: '2025-12-01', previousExpiry: '2025-12-10' }] });
    expect(parseBackup(exportBackup([original], NOW))).toEqual([{ ...original, attachmentIds: [] }]);
  });

  it('rejects foreign, malformed and partly invalid files', () => {
    expect(() => parseBackup('not json')).toThrow(/valid JSON/);
    expect(() => parseBackup('{"app":"other","version":1,"items":[]}')).toThrow(/not a LoopLab/);
    expect(() => parseBackup('{"app":"looplab","version":9,"items":[]}')).toThrow(/version/);
    const bad = JSON.stringify({ app: 'looplab', version: 1, items: [item(), { ...item({ id: 'b' }), expiresOn: '2026-13-01' }] });
    expect(() => parseBackup(bad)).toThrow(/Item 2: has an invalid expiry date/);
    const dupes = JSON.stringify({ app: 'looplab', version: 1, items: [item(), item()] });
    expect(() => parseBackup(dupes)).toThrow(/duplicate/);
  });
});
