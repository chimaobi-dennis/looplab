import type { ISODate } from './dates';
import type { CategoryId } from './categories';

export interface Renewal {
  renewedOn: ISODate;
  previousExpiry: ISODate;
}

export interface Item {
  id: string;
  name: string;
  category: CategoryId;
  expiresOn: ISODate;
  /** Days before expiry at which to remind, largest first. */
  leadDays: number[];
  /** Typical validity after renewal; null when the item does not recur. */
  renewalMonths: number | null;
  notes: string;
  attachmentIds: string[];
  /** Lead times already notified for the current expiry date. Reset on renewal. */
  notifiedLeads: number[];
  history: Renewal[];
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  itemId: string;
  name: string;
  type: string;
  blob: Blob;
}
