import type { CVData } from '../../shared/types';
import { parsePathTokens, stringifyTokens, type PathToken } from './pathParser';
import type { Patch, PatchError } from './types';

type NonRootPathToken = Exclude<PathToken, { type: 'root' }>;

export interface ApplyPatchResult {
  next: CVData;
  inverse: Patch;
  error?: PatchError;
}

interface ValueResult {
  ok: boolean;
  value?: unknown;
  error?: PatchError;
}

interface SetResult {
  ok: boolean;
  value?: unknown;
  error?: PatchError;
}

interface ArrayTargetResult {
  ok: boolean;
  parentTokens?: NonRootPathToken[];
  parentArray?: unknown[];
  indexToken?: Extract<NonRootPathToken, { type: 'index' }> | Extract<NonRootPathToken, { type: 'append' }>;
  error?: PatchError;
}

function patchError(code: string, message: string, path?: string): PatchError {
  return { code, message, path };
}

function normalizeTokens(path: string): { ok: true; tokens: NonRootPathToken[] } | { ok: false; error: PatchError } {
  try {
    const parsed = parsePathTokens(path);

    if (parsed.some((token) => token.type === 'root' && parsed.length > 1)) {
      return { ok: false, error: patchError('INVALID_PATH', 'Root token cannot be mixed with other path tokens', path) };
    }

    if (parsed.length === 1 && parsed[0].type === 'root') {
      return { ok: true, tokens: [] };
    }

    return { ok: true, tokens: parsed as NonRootPathToken[] };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to parse path';
    return { ok: false, error: patchError('INVALID_PATH', message, path) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isObjectLike(value: unknown): value is Record<string, unknown> | unknown[] {
  return typeof value === 'object' && value !== null;
}

function getValueAtPath(root: unknown, tokens: NonRootPathToken[], originalPath: string): ValueResult {
  let current: unknown = root;

  for (const token of tokens) {
    if (token.type === 'prop') {
      if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, token.value)) {
        return {
          ok: false,
          error: patchError('PATH_NOT_FOUND', `Property "${token.value}" not found`, originalPath),
        };
      }
      current = current[token.value];
      continue;
    }

    if (token.type === 'index') {
      if (!Array.isArray(current)) {
        return {
          ok: false,
          error: patchError('TYPE_MISMATCH', 'Expected an array while resolving index token', originalPath),
        };
      }

      if (token.value < 0 || token.value >= current.length) {
        return {
          ok: false,
          error: patchError('INDEX_OUT_OF_BOUNDS', `Index ${token.value} is out of bounds`, originalPath),
        };
      }

      current = current[token.value];
      continue;
    }

    return {
      ok: false,
      error: patchError('INVALID_PATH', 'Append token is not valid for direct value lookup', originalPath),
    };
  }

  return { ok: true, value: current };
}

function setValueAtPath(
  root: unknown,
  tokens: NonRootPathToken[],
  value: unknown,
  originalPath: string,
  allowCreateFinalProperty: boolean
): SetResult {
  if (tokens.length === 0) {
    return { ok: true, value };
  }

  const [head, ...rest] = tokens;

  if (head.type === 'prop') {
    if (!isRecord(root)) {
      return {
        ok: false,
        error: patchError('TYPE_MISMATCH', `Expected object at property token "${head.value}"`, originalPath),
      };
    }

    const hasKey = Object.prototype.hasOwnProperty.call(root, head.value);
    if (!hasKey && !(allowCreateFinalProperty && rest.length === 0)) {
      return {
        ok: false,
        error: patchError('PATH_NOT_FOUND', `Property "${head.value}" not found`, originalPath),
      };
    }

    const child = hasKey ? root[head.value] : undefined;
    const nextChildResult = setValueAtPath(child, rest, value, originalPath, allowCreateFinalProperty);
    if (!nextChildResult.ok) {
      return nextChildResult;
    }

    const nextChild = nextChildResult.value;
    if (hasKey && Object.is(nextChild, child)) {
      return { ok: true, value: root };
    }

    return {
      ok: true,
      value: {
        ...root,
        [head.value]: nextChild,
      },
    };
  }

  if (head.type === 'index') {
    if (!Array.isArray(root)) {
      return {
        ok: false,
        error: patchError('TYPE_MISMATCH', `Expected array at index token ${head.value}`, originalPath),
      };
    }

    if (head.value < 0 || head.value >= root.length) {
      return {
        ok: false,
        error: patchError('INDEX_OUT_OF_BOUNDS', `Index ${head.value} is out of bounds`, originalPath),
      };
    }

    const child = root[head.value];
    const nextChildResult = setValueAtPath(child, rest, value, originalPath, allowCreateFinalProperty);
    if (!nextChildResult.ok) {
      return nextChildResult;
    }

    const nextChild = nextChildResult.value;
    if (Object.is(nextChild, child)) {
      return { ok: true, value: root };
    }

    const nextArray = [...root];
    nextArray[head.value] = nextChild;
    return { ok: true, value: nextArray };
  }

  return {
    ok: false,
    error: patchError('INVALID_PATH', 'Append token can only be used with insert operations', originalPath),
  };
}

function resolveArrayTarget(root: unknown, tokens: NonRootPathToken[], originalPath: string): ArrayTargetResult {
  if (tokens.length === 0) {
    return {
      ok: false,
      error: patchError('INVALID_PATH', 'Path must target an array index', originalPath),
    };
  }

  const indexToken = tokens[tokens.length - 1];
  if (indexToken.type !== 'index' && indexToken.type !== 'append') {
    return {
      ok: false,
      error: patchError('INVALID_PATH', 'Path must end with [index] or [-1]', originalPath),
    };
  }

  const parentTokens = tokens.slice(0, -1);
  const parentValue =
    parentTokens.length === 0
      ? ({ ok: true, value: root } as ValueResult)
      : getValueAtPath(root, parentTokens, originalPath);

  if (!parentValue.ok) {
    return { ok: false, error: parentValue.error };
  }

  if (!Array.isArray(parentValue.value)) {
    return {
      ok: false,
      error: patchError('TYPE_MISMATCH', 'Insert/delete/move target parent must be an array', originalPath),
    };
  }

  return {
    ok: true,
    parentTokens,
    parentArray: parentValue.value,
    indexToken,
  };
}

function buildIndexPath(parentTokens: NonRootPathToken[], index: number): string {
  return stringifyTokens([...parentTokens, { type: 'index', value: index }]);
}

function makeErrorResult(current: CVData, patch: Patch, error: PatchError): ApplyPatchResult {
  return {
    next: current,
    inverse: patch,
    error,
  };
}

export function applyPatch(cv: CVData, patch: Patch): ApplyPatchResult {
  const normalized = normalizeTokens(patch.path);
  if (!normalized.ok) {
    return makeErrorResult(cv, patch, normalized.error);
  }

  const tokens = normalized.tokens;

  if (patch.op === 'set') {
    if (tokens.length === 0) {
      return {
        next: patch.value as CVData,
        inverse: { op: 'set', path: '', value: cv },
      };
    }

    const parentTokens = tokens.slice(0, -1);
    const finalToken = tokens[tokens.length - 1];

    if (finalToken.type === 'append') {
      return makeErrorResult(
        cv,
        patch,
        patchError('INVALID_PATH', 'Set operation does not support append token', patch.path)
      );
    }

    if (finalToken.type === 'index') {
      const currentValue = getValueAtPath(cv, tokens, patch.path);
      if (!currentValue.ok) {
        return makeErrorResult(cv, patch, currentValue.error ?? patchError('APPLY_ERROR', 'Failed to set value', patch.path));
      }

      const updated = setValueAtPath(cv, tokens, patch.value, patch.path, false);
      if (!updated.ok) {
        return makeErrorResult(cv, patch, updated.error ?? patchError('APPLY_ERROR', 'Failed to set value', patch.path));
      }

      return {
        next: updated.value as CVData,
        inverse: { op: 'set', path: patch.path, value: currentValue.value },
      };
    }

    const parentLookup =
      parentTokens.length === 0
        ? ({ ok: true, value: cv } as ValueResult)
        : getValueAtPath(cv, parentTokens, patch.path);

    if (!parentLookup.ok) {
      return makeErrorResult(cv, patch, parentLookup.error ?? patchError('PATH_NOT_FOUND', 'Parent path not found', patch.path));
    }

    if (!isRecord(parentLookup.value)) {
      return makeErrorResult(cv, patch, patchError('TYPE_MISMATCH', 'Parent for property set must be an object', patch.path));
    }

    const hadProperty = Object.prototype.hasOwnProperty.call(parentLookup.value, finalToken.value);
    const oldValue = hadProperty ? parentLookup.value[finalToken.value] : undefined;
    const updated = setValueAtPath(cv, tokens, patch.value, patch.path, true);

    if (!updated.ok) {
      return makeErrorResult(cv, patch, updated.error ?? patchError('APPLY_ERROR', 'Failed to set value', patch.path));
    }

    return {
      next: updated.value as CVData,
      inverse: hadProperty
        ? { op: 'set', path: patch.path, value: oldValue }
        : { op: 'delete', path: patch.path },
    };
  }

  if (patch.op === 'replace') {
    const currentValue =
      tokens.length === 0
        ? ({ ok: true, value: cv } as ValueResult)
        : getValueAtPath(cv, tokens, patch.path);

    if (!currentValue.ok) {
      return makeErrorResult(cv, patch, currentValue.error ?? patchError('PATH_NOT_FOUND', 'Replace target not found', patch.path));
    }

    if (!isObjectLike(currentValue.value)) {
      return makeErrorResult(cv, patch, patchError('TYPE_MISMATCH', 'Replace target must be an existing object/array', patch.path));
    }

    const updated = setValueAtPath(cv, tokens, patch.value, patch.path, false);
    if (!updated.ok) {
      return makeErrorResult(cv, patch, updated.error ?? patchError('APPLY_ERROR', 'Failed to replace value', patch.path));
    }

    return {
      next: updated.value as CVData,
      inverse: { op: 'replace', path: patch.path, value: currentValue.value },
    };
  }

  if (patch.op === 'merge') {
    const currentValue =
      tokens.length === 0
        ? ({ ok: true, value: cv } as ValueResult)
        : getValueAtPath(cv, tokens, patch.path);

    if (!currentValue.ok) {
      return makeErrorResult(cv, patch, currentValue.error ?? patchError('PATH_NOT_FOUND', 'Merge target not found', patch.path));
    }

    if (!isRecord(currentValue.value)) {
      return makeErrorResult(cv, patch, patchError('TYPE_MISMATCH', 'Merge target must be a plain object', patch.path));
    }

    if (!isRecord(patch.value)) {
      return makeErrorResult(cv, patch, patchError('TYPE_MISMATCH', 'Merge value must be a plain object', patch.path));
    }

    const merged = { ...currentValue.value, ...patch.value };
    const updated = setValueAtPath(cv, tokens, merged, patch.path, false);
    if (!updated.ok) {
      return makeErrorResult(cv, patch, updated.error ?? patchError('APPLY_ERROR', 'Failed to merge value', patch.path));
    }

    return {
      next: updated.value as CVData,
      inverse: { op: 'replace', path: patch.path, value: currentValue.value },
    };
  }

  if (patch.op === 'insert') {
    const target = resolveArrayTarget(cv, tokens, patch.path);
    if (!target.ok || !target.parentTokens || !target.parentArray || !target.indexToken) {
      return makeErrorResult(cv, patch, target.error ?? patchError('APPLY_ERROR', 'Failed to resolve insert target', patch.path));
    }

    const resolvedIndex =
      target.indexToken.type === 'append' ? target.parentArray.length : target.indexToken.value;

    if (resolvedIndex < 0 || resolvedIndex > target.parentArray.length) {
      return makeErrorResult(
        cv,
        patch,
        patchError('INDEX_OUT_OF_BOUNDS', `Insert index ${resolvedIndex} is out of bounds`, patch.path)
      );
    }

    const nextArray = [...target.parentArray];
    nextArray.splice(resolvedIndex, 0, patch.value);

    const updated = setValueAtPath(cv, target.parentTokens, nextArray, patch.path, false);
    if (!updated.ok) {
      return makeErrorResult(cv, patch, updated.error ?? patchError('APPLY_ERROR', 'Failed to insert value', patch.path));
    }

    return {
      next: updated.value as CVData,
      inverse: { op: 'delete', path: buildIndexPath(target.parentTokens, resolvedIndex) },
    };
  }

  if (patch.op === 'delete') {
    if (tokens.length === 0) {
      return makeErrorResult(cv, patch, patchError('INVALID_PATH', 'Delete operation does not support root path', patch.path));
    }

    const parentTokens = tokens.slice(0, -1);
    const finalToken = tokens[tokens.length - 1];
    const parentValue =
      parentTokens.length === 0
        ? ({ ok: true, value: cv } as ValueResult)
        : getValueAtPath(cv, parentTokens, patch.path);

    if (!parentValue.ok) {
      return makeErrorResult(cv, patch, parentValue.error ?? patchError('PATH_NOT_FOUND', 'Delete parent path not found', patch.path));
    }

    if (finalToken.type === 'append') {
      return makeErrorResult(cv, patch, patchError('INVALID_PATH', 'Delete operation does not support append token', patch.path));
    }

    if (finalToken.type === 'prop') {
      if (!isRecord(parentValue.value)) {
        return makeErrorResult(cv, patch, patchError('TYPE_MISMATCH', 'Delete property parent must be an object', patch.path));
      }

      if (!Object.prototype.hasOwnProperty.call(parentValue.value, finalToken.value)) {
        return makeErrorResult(cv, patch, patchError('PATH_NOT_FOUND', `Property "${finalToken.value}" not found`, patch.path));
      }

      const removedValue = parentValue.value[finalToken.value];
      const nextParent = { ...parentValue.value };
      delete nextParent[finalToken.value];

      const updated = setValueAtPath(cv, parentTokens, nextParent, patch.path, false);
      if (!updated.ok) {
        return makeErrorResult(cv, patch, updated.error ?? patchError('APPLY_ERROR', 'Failed to delete property', patch.path));
      }

      return {
        next: updated.value as CVData,
        inverse: { op: 'set', path: patch.path, value: removedValue },
      };
    }

    if (!Array.isArray(parentValue.value)) {
      return makeErrorResult(cv, patch, patchError('TYPE_MISMATCH', 'Delete index parent must be an array', patch.path));
    }

    if (finalToken.value < 0 || finalToken.value >= parentValue.value.length) {
      return makeErrorResult(
        cv,
        patch,
        patchError('INDEX_OUT_OF_BOUNDS', `Delete index ${finalToken.value} is out of bounds`, patch.path)
      );
    }

    const removedValue = parentValue.value[finalToken.value];
    const nextArray = [...parentValue.value];
    nextArray.splice(finalToken.value, 1);

    const updated = setValueAtPath(cv, parentTokens, nextArray, patch.path, false);
    if (!updated.ok) {
      return makeErrorResult(cv, patch, updated.error ?? patchError('APPLY_ERROR', 'Failed to delete array item', patch.path));
    }

    return {
      next: updated.value as CVData,
      inverse: { op: 'insert', path: patch.path, value: removedValue },
    };
  }

  if (patch.op === 'move') {
    if (!patch.from) {
      return makeErrorResult(cv, patch, patchError('INVALID_PATCH', 'Move operation requires "from" path', patch.path));
    }

    const fromNormalized = normalizeTokens(patch.from);
    if (!fromNormalized.ok) {
      return makeErrorResult(cv, patch, fromNormalized.error);
    }

    const fromTokens = fromNormalized.tokens;
    const fromTarget = resolveArrayTarget(cv, fromTokens, patch.from);

    if (!fromTarget.ok || !fromTarget.parentTokens || !fromTarget.parentArray || !fromTarget.indexToken) {
      return makeErrorResult(cv, patch, fromTarget.error ?? patchError('APPLY_ERROR', 'Failed to resolve move source', patch.from));
    }

    if (fromTarget.indexToken.type !== 'index') {
      return makeErrorResult(cv, patch, patchError('INVALID_PATH', 'Move source must use explicit [index]', patch.from));
    }

    const fromIndex = fromTarget.indexToken.value;
    if (fromIndex < 0 || fromIndex >= fromTarget.parentArray.length) {
      return makeErrorResult(
        cv,
        patch,
        patchError('INDEX_OUT_OF_BOUNDS', `Move source index ${fromIndex} is out of bounds`, patch.from)
      );
    }

    const movedValue = fromTarget.parentArray[fromIndex];
    const sourceAfterDelete = [...fromTarget.parentArray];
    sourceAfterDelete.splice(fromIndex, 1);

    const intermediateSet = setValueAtPath(cv, fromTarget.parentTokens, sourceAfterDelete, patch.from, false);
    if (!intermediateSet.ok) {
      return makeErrorResult(cv, patch, intermediateSet.error ?? patchError('APPLY_ERROR', 'Failed to remove move source', patch.from));
    }

    const intermediate = intermediateSet.value as CVData;
    const toTarget = resolveArrayTarget(intermediate, tokens, patch.path);
    if (!toTarget.ok || !toTarget.parentTokens || !toTarget.parentArray || !toTarget.indexToken) {
      return makeErrorResult(cv, patch, toTarget.error ?? patchError('APPLY_ERROR', 'Failed to resolve move target', patch.path));
    }

    const toIndex = toTarget.indexToken.type === 'append' ? toTarget.parentArray.length : toTarget.indexToken.value;
    if (toIndex < 0 || toIndex > toTarget.parentArray.length) {
      return makeErrorResult(
        cv,
        patch,
        patchError('INDEX_OUT_OF_BOUNDS', `Move destination index ${toIndex} is out of bounds`, patch.path)
      );
    }

    const targetAfterInsert = [...toTarget.parentArray];
    targetAfterInsert.splice(toIndex, 0, movedValue);

    const finalSet = setValueAtPath(intermediate, toTarget.parentTokens, targetAfterInsert, patch.path, false);
    if (!finalSet.ok) {
      return makeErrorResult(cv, patch, finalSet.error ?? patchError('APPLY_ERROR', 'Failed to insert move target', patch.path));
    }

    const insertedPath = buildIndexPath(toTarget.parentTokens, toIndex);
    const originalPath = buildIndexPath(fromTarget.parentTokens, fromIndex);

    return {
      next: finalSet.value as CVData,
      inverse: {
        op: 'move',
        from: insertedPath,
        path: originalPath,
      },
    };
  }

  return makeErrorResult(cv, patch, patchError('INVALID_PATCH', `Unsupported op "${patch.op}"`, patch.path));
}
