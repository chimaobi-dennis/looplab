import type { Attachment, Item } from '../core/types';

/**
 * IndexedDB persistence. Everything stays on the device: there is no server.
 * Photos are stored as Blobs in their own store so listing items stays cheap.
 */
const DB_NAME = 'looplab';
const DB_VERSION = 1;
const ITEMS = 'items';
const ATTACHMENTS = 'attachments';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(ATTACHMENTS)) {
        db.createObjectStore(ATTACHMENTS, { keyPath: 'id' }).createIndex('itemId', 'itemId');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('Could not open local storage.'));
    };
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Runs `work` in one transaction and resolves only once it has committed. */
async function transact<T>(
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(stores, mode);
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted.'));
  });
  const result = await work(tx);
  await done;
  return result;
}

export function getAllItems(): Promise<Item[]> {
  return transact([ITEMS], 'readonly', (tx) => requestToPromise<Item[]>(tx.objectStore(ITEMS).getAll()));
}

export function putItems(items: readonly Item[]): Promise<void> {
  return transact([ITEMS], 'readwrite', (tx) => {
    for (const item of items) tx.objectStore(ITEMS).put(item);
  });
}

/** Saves an item together with its photo changes, atomically. */
export function saveItem(item: Item, added: readonly Attachment[] = [], removedIds: readonly string[] = []): Promise<void> {
  return transact([ITEMS, ATTACHMENTS], 'readwrite', (tx) => {
    tx.objectStore(ITEMS).put(item);
    for (const attachment of added) tx.objectStore(ATTACHMENTS).put(attachment);
    for (const id of removedIds) tx.objectStore(ATTACHMENTS).delete(id);
  });
}

export function deleteItem(item: Pick<Item, 'id' | 'attachmentIds'>): Promise<void> {
  return transact([ITEMS, ATTACHMENTS], 'readwrite', (tx) => {
    tx.objectStore(ITEMS).delete(item.id);
    for (const id of item.attachmentIds) tx.objectStore(ATTACHMENTS).delete(id);
  });
}

export function getAttachments(itemId: string): Promise<Attachment[]> {
  return transact([ATTACHMENTS], 'readonly', (tx) =>
    requestToPromise<Attachment[]>(tx.objectStore(ATTACHMENTS).index('itemId').getAll(itemId)),
  );
}

/** Asks the browser not to evict our data under storage pressure. Best effort. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Not supported or denied: data still works, it is just evictable.
  }
}
