import { applyPatch } from './applyPatch';
import type {
  CVDocument,
  DispatchOptions,
  DispatchResult,
  Patch,
  PatchError,
} from './types';

interface DispatcherStore {
  document: CVDocument;
}

function toPatchArray(patch: Patch | Patch[]): Patch[] {
  return Array.isArray(patch) ? patch : [patch];
}

function patchError(code: string, message: string, path?: string): PatchError {
  return { code, message, path };
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isObjectRecord(value) && !Array.isArray(value);
}

function validatePatchShape(patch: Patch): PatchError | null {
  if (!isObjectRecord(patch)) {
    return patchError('INVALID_PATCH', 'Patch must be an object');
  }

  if (typeof patch.op !== 'string' || patch.op.length === 0) {
    return patchError('INVALID_PATCH', 'Patch op is required');
  }

  if (!patch.path && patch.path !== '') {
    return patchError('INVALID_PATCH', 'Patch path is required');
  }

  if (typeof patch.path !== 'string') {
    return patchError('INVALID_PATCH', 'Patch path must be a string');
  }

  if (patch.op === 'set' || patch.op === 'replace' || patch.op === 'insert') {
    if (!('value' in patch)) {
      return patchError('INVALID_PATCH', `${patch.op} patch requires a value`, patch.path);
    }
  }

  if (patch.op === 'merge') {
    if (!('value' in patch)) {
      return patchError('INVALID_PATCH', 'merge patch requires a value', patch.path);
    }

    if (!isPlainObject(patch.value)) {
      return patchError('INVALID_PATCH', 'merge patch value must be a plain object', patch.path);
    }
  }

  if (patch.op === 'move' && !patch.from) {
    return patchError('INVALID_PATCH', 'Move patch requires a from path', patch.path);
  }

  if (patch.op === 'move' && typeof patch.from !== 'string') {
    return patchError('INVALID_PATCH', 'Move patch from path must be a string', patch.path);
  }

  return null;
}

export function createDispatcher(store: DispatcherStore) {
  return function dispatch(patch: Patch | Patch[], opts?: DispatchOptions): DispatchResult {
    void opts;
    const patches = toPatchArray(patch);

    if (patches.length === 0) {
      return {
        success: false,
        error: patchError('INVALID_PATCH', 'Dispatch requires at least one patch'),
        appliedPatches: [],
      };
    }

    for (const current of patches) {
      const shapeError = validatePatchShape(current);
      if (shapeError) {
        return { success: false, error: shapeError, appliedPatches: [] };
      }
    }

    try {
      let nextData = store.document.data;
      const appliedPatches: Patch[] = [];
      const inversePatches: Patch[] = [];

      for (const current of patches) {
        const result = applyPatch(nextData, current);
        if (result.error) {
          return {
            success: false,
            error: result.error,
            appliedPatches: [],
          };
        }

        nextData = result.next;
        appliedPatches.push(current);
        inversePatches.unshift(result.inverse);
      }

      store.document = {
        ...store.document,
        data: nextData,
        revision: store.document.revision + 1,
      };

      return {
        success: true,
        revision: store.document.revision,
        appliedPatches,
        inversePatches,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected dispatch error';
      const details = error instanceof Error ? ` (${error.name})` : '';

      return {
        success: false,
        error: patchError('INTERNAL_ERROR', `${message}${details}`),
        appliedPatches: [],
      };
    }
  };
}
