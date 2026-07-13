import type { CVData } from '../../shared/types';
import type { HistoryAPI } from './history';

export interface CVDocument {
  schemaVersion: 1;
  revision: number;
  data: CVData;
  meta: { lastSavedAt: number | null };
}

export type PatchOp = 'set' | 'replace' | 'merge' | 'insert' | 'delete' | 'move';

export interface Patch {
  op: PatchOp;
  path: string;
  value?: unknown;
  from?: string;
}

export interface DispatchResult {
  success: boolean;
  revision?: number;
  appliedPatches?: Patch[];
  inversePatches?: Patch[];
  error?: PatchError;
}

export interface DispatchOptions {
  txId?: string;
  origin: 'editor' | 'external' | 'import' | 'undo' | 'redo';
  label?: string;
}

export interface RecentChangeEntry {
  revision: number;
  at: number;
  origin: DispatchOptions['origin'];
}

export interface StoreAPI {
  getSnapshot(): CVDocument;
  subscribe(cb: (doc: CVDocument) => void): () => void;
  dispatch(patch: Patch | Patch[], opts?: DispatchOptions): DispatchResult;
  history: HistoryAPI;
  getRecentChanges(): Map<string, RecentChangeEntry>;
}

export type CVSelector<T> = (doc: CVDocument) => T;

export interface PatchError {
  code: string;
  message: string;
  path?: string;
}
