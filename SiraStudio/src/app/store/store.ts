import type {
  CVDocument,
  DispatchOptions,
  DispatchResult,
  Patch,
  RecentChangeEntry,
  StoreAPI,
} from './types';
import { createDispatcher } from './dispatch';
import { createHistory } from './history';
import { saveCVData } from '../../shared/utils/settings';

function toPatchArray(patch: Patch | Patch[]): Patch[] {
  return Array.isArray(patch) ? patch : [patch];
}

const HIGHLIGHT_TTL = 10_000;

interface CreateCVStoreOptions {
  /** When false, edits stay in memory only (used by ephemeral previews). */
  persist?: boolean;
}

export function createCVStore(initial: CVDocument, options: CreateCVStoreOptions = {}): StoreAPI {
  const persist = options.persist !== false;
  const state = { document: initial };
  const listeners = new Set<(nextDoc: CVDocument) => void>();
  const history = createHistory();
  const recentChanges = new Map<string, RecentChangeEntry>();
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  const schedulePersist = (doc: CVDocument) => {
    if (!persist) return;

    if (saveTimeout !== null) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(() => {
      saveCVData(doc);
      saveTimeout = null;
    }, 300);
  };

  const flushPersist = () => {
    if (saveTimeout === null) return;

    clearTimeout(saveTimeout);
    saveTimeout = null;
    saveCVData(state.document);
  };

  if (persist && typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushPersist);
    import.meta.hot?.dispose(() => window.removeEventListener('pagehide', flushPersist));
  }

  const notify = () => {
    listeners.forEach((listener) => listener(state.document));
  };

  const getSnapshot = () => state.document;

  const subscribe = (cb: (nextDoc: CVDocument) => void) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  };

  const getRecentChanges = () => recentChanges;

  const pruneRecentChanges = () => {
    const cutoff = Date.now() - HIGHLIGHT_TTL;
    for (const [path, entry] of recentChanges) {
      if (entry.at < cutoff) {
        recentChanges.delete(path);
      }
    }
  };

  const baseDispatch = createDispatcher(state);

  const dispatch = (patch: Patch | Patch[], opts?: DispatchOptions): DispatchResult => {
    const patches = toPatchArray(patch);
    const origin: DispatchOptions['origin'] = opts?.origin ?? 'editor';
    const result = baseDispatch(patches, opts);

    if (result.success) {
      if (
        origin !== 'undo' &&
        origin !== 'redo' &&
        typeof result.revision === 'number' &&
        (result.appliedPatches?.length ?? 0) > 0 &&
        (result.inversePatches?.length ?? 0) > 0
      ) {
        history.push({
          revision: result.revision,
          patches: result.appliedPatches ?? [],
          inverse: result.inversePatches ?? [],
          label: opts?.label ?? '',
          at: Date.now(),
          origin,
        });
      }

      const now = Date.now();
      for (const p of result.appliedPatches ?? []) {
        recentChanges.set(p.path, {
          revision: result.revision ?? state.document.revision,
          at: now,
          origin,
        });
      }
      pruneRecentChanges();

      schedulePersist(state.document);
      notify();
    }

    return result;
  };

  return {
    getSnapshot,
    subscribe,
    dispatch,
    history,
    getRecentChanges,
  };
}
