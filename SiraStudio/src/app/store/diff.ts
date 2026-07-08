import type { CVData } from '../../shared/types';
import type { Patch } from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function pathForKey(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

function pathForIndex(base: string, index: number): string {
  return `${base}[${index}]`;
}

function deepCloneFallback(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneFallback(item));
  }

  if (isRecord(value)) {
    const output: Record<string, unknown> = {};
    Object.entries(value).forEach(([key, current]) => {
      output[key] = deepCloneFallback(current);
    });
    return output;
  }

  return value;
}

function cloneValue<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return deepCloneFallback(value) as T;
  }
}

function diffUnknown(path: string, from: unknown, to: unknown, patches: Patch[]): void {
  if (Object.is(from, to)) {
    return;
  }

  if (Array.isArray(from) && Array.isArray(to)) {
    const shared = Math.min(from.length, to.length);

    for (let i = 0; i < shared; i += 1) {
      diffUnknown(pathForIndex(path, i), from[i], to[i], patches);
    }

    for (let i = shared; i < to.length; i += 1) {
      patches.push({
        op: 'insert',
        path: pathForIndex(path, i),
        value: cloneValue(to[i]),
      });
    }

    for (let i = from.length - 1; i >= to.length; i -= 1) {
      patches.push({
        op: 'delete',
        path: pathForIndex(path, i),
      });
    }

    return;
  }

  if (isPlainObject(from) && isPlainObject(to)) {
    const fromKeys = Object.keys(from).sort();
    const toKeys = Object.keys(to).sort();

    fromKeys.forEach((key) => {
      if (!(key in to)) {
        patches.push({ op: 'delete', path: pathForKey(path, key) });
      }
    });

    toKeys.forEach((key) => {
      if (!(key in from)) {
        patches.push({ op: 'set', path: pathForKey(path, key), value: cloneValue(to[key]) });
        return;
      }

      diffUnknown(pathForKey(path, key), from[key], to[key], patches);
    });

    return;
  }

  patches.push({
    op: 'set',
    path,
    value: cloneValue(to),
  });
}

export function diffCVData(from: CVData, to: CVData): Patch[] {
  const patches: Patch[] = [];
  diffUnknown('', from, to, patches);
  return patches;
}
