import type { DispatchOptions, Patch } from './types';

const DEFAULT_MAX_SIZE = 50;
const DEFAULT_COALESCE_MS = 500;
const DEFAULT_SNAPSHOT_EVERY = 20;

export interface HistoryEntry {
  revision: number;
  patches: Patch[];
  inverse: Patch[];
  label: string;
  at: number;
  origin: DispatchOptions['origin'];
}

export interface HistorySnapshot {
  entryIndex: number;
  revision: number;
  at: number;
}

export interface CreateHistoryOptions {
  maxSize?: number;
  coalesceMs?: number;
  snapshotEvery?: number;
}

export interface HistoryAPI {
  push(entry: HistoryEntry): void;
  undo(): HistoryEntry | null;
  redo(): HistoryEntry | null;
  reset(): void;
  readonly entries: HistoryEntry[];
  readonly current: HistoryEntry | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly length: number;
  readonly cursor: number;
  readonly snapshots: HistorySnapshot[];
}

function toPositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function toNonNegativeInt(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return normalized >= 0 ? normalized : fallback;
}

function cloneEntry(entry: HistoryEntry): HistoryEntry {
  return {
    ...entry,
    patches: [...entry.patches],
    inverse: [...entry.inverse],
  };
}

function hasSingleForwardAndInverse(entry: HistoryEntry): boolean {
  return entry.patches.length === 1 && entry.inverse.length === 1;
}

function canCoalesce(prev: HistoryEntry | undefined, next: HistoryEntry, windowMs: number): boolean {
  if (!prev) {
    return false;
  }

  if (!hasSingleForwardAndInverse(prev) || !hasSingleForwardAndInverse(next)) {
    return false;
  }

  if (next.origin !== prev.origin) {
    return false;
  }

  const elapsed = next.at - prev.at;
  if (elapsed < 0 || elapsed > windowMs) {
    return false;
  }

  const prevPatch = prev.patches[0];
  const nextPatch = next.patches[0];

  return prevPatch.op === nextPatch.op && prevPatch.path === nextPatch.path;
}

function mergeEntries(prev: HistoryEntry, next: HistoryEntry): HistoryEntry {
  return {
    revision: next.revision,
    patches: [...next.patches],
    inverse: [...prev.inverse],
    label: next.label.trim().length > 0 ? next.label : prev.label,
    at: next.at,
    origin: next.origin,
  };
}

function recomputeSnapshots(entries: HistoryEntry[], snapshotEvery: number): HistorySnapshot[] {
  const snapshots: HistorySnapshot[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    if ((index + 1) % snapshotEvery !== 0) {
      continue;
    }

    const entry = entries[index];
    snapshots.push({
      entryIndex: index,
      revision: entry.revision,
      at: entry.at,
    });
  }

  return snapshots;
}

export function createHistory(options: CreateHistoryOptions = {}): HistoryAPI {
  const maxSize = toPositiveInt(options.maxSize, DEFAULT_MAX_SIZE);
  const coalesceMs = toNonNegativeInt(options.coalesceMs, DEFAULT_COALESCE_MS);
  const snapshotEvery = toPositiveInt(options.snapshotEvery, DEFAULT_SNAPSHOT_EVERY);

  const entries: HistoryEntry[] = [];
  let cursor = -1;
  let snapshots: HistorySnapshot[] = [];

  const refreshSnapshots = () => {
    snapshots = recomputeSnapshots(entries, snapshotEvery);
  };

  return {
    push(entry) {
      const nextEntry = cloneEntry(entry);

      if (cursor < entries.length - 1) {
        entries.splice(cursor + 1);
      }

      const current = cursor >= 0 ? entries[cursor] : undefined;

      if (current && canCoalesce(current, nextEntry, coalesceMs)) {
        entries[cursor] = mergeEntries(current, nextEntry);
      } else {
        entries.push(nextEntry);
        cursor = entries.length - 1;
      }

      if (entries.length > maxSize) {
        const overflow = entries.length - maxSize;
        entries.splice(0, overflow);
        cursor -= overflow;
      }

      if (entries.length === 0) {
        cursor = -1;
      }

      refreshSnapshots();
    },

    undo() {
      if (cursor < 0) {
        return null;
      }

      const entry = entries[cursor];
      cursor -= 1;
      return entry;
    },

    redo() {
      if (cursor + 1 >= entries.length) {
        return null;
      }

      cursor += 1;
      return entries[cursor];
    },

    reset() {
      entries.length = 0;
      cursor = -1;
      snapshots = [];
    },

    get current() {
      return cursor >= 0 ? entries[cursor] : null;
    },

    get entries() {
      return entries.map((entry) => cloneEntry(entry));
    },

    get canUndo() {
      return cursor >= 0;
    },

    get canRedo() {
      return cursor + 1 < entries.length;
    },

    get length() {
      return entries.length;
    },

    get cursor() {
      return cursor;
    },

    get snapshots() {
      return [...snapshots];
    },
  };
}
