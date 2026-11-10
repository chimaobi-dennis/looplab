/**
 * Category presets. The point of the app: a passport needs months of notice,
 * a subscription needs days, and the user should not have to work that out.
 */
export interface Category {
  id: string;
  label: string;
  emoji: string;
  leadDays: number[];
  renewalMonths: number | null;
  hint?: string;
}

export const CATEGORIES = [
  {
    id: 'passport',
    label: 'Passport',
    emoji: '🛂',
    leadDays: [270, 180, 90],
    renewalMonths: 120,
    hint: 'Many countries refuse entry with under 6 months left, so reminders start early.',
  },
  { id: 'id-card', label: 'ID card', emoji: '🪪', leadDays: [90, 30, 7], renewalMonths: 120 },
  { id: 'licence', label: 'Driving licence', emoji: '🚗', leadDays: [90, 30, 7], renewalMonths: 60 },
  {
    id: 'visa',
    label: 'Visa / permit',
    emoji: '🌍',
    leadDays: [120, 60, 14],
    renewalMonths: null,
    hint: 'Renewal applications often have to be filed well before expiry.',
  },
  { id: 'insurance', label: 'Insurance', emoji: '🛡️', leadDays: [30, 14, 3], renewalMonths: 12 },
  { id: 'vehicle', label: 'Vehicle service / inspection', emoji: '🔧', leadDays: [30, 7], renewalMonths: 12 },
  {
    id: 'warranty',
    label: 'Warranty / return window',
    emoji: '🧾',
    leadDays: [30, 7],
    renewalMonths: null,
    hint: 'Attach the receipt so you have it when you claim.',
  },
  { id: 'subscription', label: 'Subscription', emoji: '🔁', leadDays: [7, 2], renewalMonths: 12 },
  { id: 'health', label: 'Health / prescription', emoji: '💊', leadDays: [14, 3], renewalMonths: null },
  { id: 'other', label: 'Other', emoji: '📌', leadDays: [30, 7], renewalMonths: null },
] as const satisfies readonly Category[];

export type CategoryId = (typeof CATEGORIES)[number]['id'];

export function isCategoryId(value: unknown): value is CategoryId {
  return CATEGORIES.some((c) => c.id === value);
}

export function getCategory(id: CategoryId): Category {
  // The cast is safe: CategoryId is derived from this list.
  return CATEGORIES.find((c) => c.id === id) as Category;
}
