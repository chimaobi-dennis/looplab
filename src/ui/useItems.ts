import { useCallback, useEffect, useState } from 'react';
import type { Attachment, Item } from '../core/types';
import * as db from '../storage/db';

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string };

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Something went wrong with local storage.';
}

/** Items held in memory, mirrored to IndexedDB. Storage is written first so the screen never shows unsaved data. */
export function useItems() {
  const [items, setItems] = useState<Item[]>([]);
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    db.getAllItems().then(
      (loaded) => {
        if (cancelled) return;
        setItems(loaded);
        setState({ status: 'ready' });
      },
      (error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: errorMessage(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (item: Item, added: Attachment[] = [], removedIds: string[] = []) => {
    await db.saveItem(item, added, removedIds);
    setItems((current) => [...current.filter((i) => i.id !== item.id), item]);
    void db.requestPersistence();
  }, []);

  const saveMany = useCallback(async (changed: Item[]) => {
    if (changed.length === 0) return;
    await db.putItems(changed);
    const ids = new Set(changed.map((i) => i.id));
    setItems((current) => [...current.filter((i) => !ids.has(i.id)), ...changed]);
  }, []);

  const remove = useCallback(async (item: Item) => {
    await db.deleteItem(item);
    setItems((current) => current.filter((i) => i.id !== item.id));
  }, []);

  return { items, state, save, saveMany, remove };
}
