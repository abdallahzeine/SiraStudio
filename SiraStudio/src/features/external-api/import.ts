import { diffCVData } from '../../app/store';
import type { DispatchResult, StoreAPI } from '../../app/store';
import type { CVData } from '../../shared/types';

export type ExternalImportFormat = 'cv-maker' | 'json-resume';

function patchError(code: string, message: string): DispatchResult {
  return {
    success: false,
    error: { code, message },
  };
}

function parseRawJSON(raw: unknown): unknown {
  if (typeof raw === 'string') {
    return JSON.parse(raw);
  }

  return raw;
}

function dispatchImportedCVData(
  store: Pick<StoreAPI, 'getSnapshot' | 'dispatch'>,
  nextData: CVData,
  fmt: ExternalImportFormat
): DispatchResult {
  const currentSnapshot = store.getSnapshot();
  const patches = diffCVData(currentSnapshot.data, nextData);

  if (patches.length === 0) {
    return {
      success: true,
      revision: currentSnapshot.revision,
      appliedPatches: [],
      inversePatches: [],
    };
  }

  return store.dispatch(patches, {
    origin: 'import',
    txId: `import-${Date.now()}`,
    label: `import:${fmt}`,
  });
}

export function importJSONWithResolver(
  store: Pick<StoreAPI, 'getSnapshot' | 'dispatch'>,
  raw: unknown,
  fmt: ExternalImportFormat,
  resolver: (parsed: unknown, fmt: ExternalImportFormat) => CVData | null
): DispatchResult {
  let parsed: unknown;

  try {
    parsed = parseRawJSON(raw);
  } catch {
    return patchError('INVALID_JSON', 'Failed to parse input JSON');
  }

  const data = resolver(parsed, fmt);
  if (!data) {
    return patchError(
      'INVALID_IMPORT',
      `Invalid ${fmt} payload: expected a valid current schema or a recognized legacy schema`
    );
  }

  return dispatchImportedCVData(store, data, fmt);
}
