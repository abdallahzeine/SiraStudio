import { useContext, useEffect, useReducer, useRef, useSyncExternalStore } from 'react';
import { CVStoreContext } from './storeContext';
import { shallowEqual } from './shallowEqual';
import type {
  CVSelector,
  StoreAPI,
} from './types';

const HIGHLIGHT_DURATION = 1500;

type SelectorCache<T> =
  | { hasValue: false }
  | { hasValue: true; value: T };

export function useCVSelector<T>(selector: CVSelector<T>): T {
  const store = useContext(CVStoreContext);
  const cacheRef = useRef<SelectorCache<T>>({ hasValue: false });

  if (!store) {
    throw new Error('useCVSelector outside CVStoreProvider');
  }

  const getSelectedSnapshot = () => {
    const next = selector(store.getSnapshot());
    const previous = cacheRef.current;

    if (previous.hasValue && shallowEqual(previous.value, next)) {
      return previous.value;
    }

    cacheRef.current = { hasValue: true, value: next };
    return next;
  };

  return useSyncExternalStore(
    store.subscribe,
    getSelectedSnapshot,
    getSelectedSnapshot
  );
}

export function useDispatch(): StoreAPI['dispatch'] {
  const store = useContext(CVStoreContext);

  if (!store) {
    throw new Error('useDispatch outside CVStoreProvider');
  }

  return store.dispatch;
}

export function useHistory(): StoreAPI['history'] {
  const store = useContext(CVStoreContext);

  if (!store) {
    throw new Error('useHistory outside CVStoreProvider');
  }

  return store.history;
}

export function useChangeHighlight(path?: string): boolean {
  const store = useContext(CVStoreContext);
  const [, tick] = useReducer((n: number) => n + 1, 0);

  if (!store) {
    throw new Error('useChangeHighlight outside CVStoreProvider');
  }

  const revision = useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().revision,
    () => store.getSnapshot().revision
  );
  void revision;

  const changes = store.getRecentChanges();
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  let latestAt = 0;

  for (const [patchPath, entry] of changes) {
    if (now - entry.at > HIGHLIGHT_DURATION) continue;
    if (patchPath === path || patchPath.startsWith(path + '.')) {
      latestAt = Math.max(latestAt, entry.at);
    }
  }

  const isActive = latestAt > 0 && now - latestAt < HIGHLIGHT_DURATION;

  useEffect(() => {
    if (!isActive) return;
    const remaining = HIGHLIGHT_DURATION - (Date.now() - latestAt);
    const timer = setTimeout(() => tick(), Math.max(0, remaining));
    return () => clearTimeout(timer);
  }, [isActive, latestAt, tick]);

  return isActive;
}
