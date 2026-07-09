import type { CVData } from '../../../shared/types';
import type { CVDocument } from '../../../app/store/types';
import { loadCVData, saveCVData } from '../../../shared/utils/settings';
import {
  CVDocumentAPIError,
  getCVDocument,
  listCVDocuments,
  type SavedCVDocumentResponse,
} from '../api/cv-documents';
import { isValidCVData } from './snapshots';
import {
  clearSavedDocumentState,
  loadSavedDocumentState,
  savedDocumentStateFromResponse,
  saveSavedDocumentState,
} from './saved-document-state';

const SCHEMA_VERSION = 1 as const;
const BACKEND_LOAD_TIMEOUT_MS = 2_500;

interface BackendDocumentLoadOptions {
  signal?: AbortSignal;
}

interface InitialDocumentLoadOptions {
  timeoutMs?: number;
}

function normalizeRevision(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function timestampFromDate(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  ) || (
    error instanceof Error && error.name === 'AbortError'
  );
}

function isMissingDocumentError(error: unknown): boolean {
  return error instanceof CVDocumentAPIError && error.status === 404;
}

export function isRevisionConflictError(error: unknown): boolean {
  return error instanceof CVDocumentAPIError && (error.status === 409 || error.status === 412);
}

export function titleForCVDocument(cv: CVData): string {
  return cv.header.name.trim() || 'My CV';
}

export function cvDocumentFromSavedResponse(response: SavedCVDocumentResponse): CVDocument | null {
  if (!isValidCVData(response.cv)) {
    return null;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    revision: normalizeRevision(response.revision),
    data: response.cv,
    meta: { lastSavedAt: timestampFromDate(response.updated_at) },
  };
}

export function pickMostRecentCVDocumentResponse(
  documents: SavedCVDocumentResponse[]
): SavedCVDocumentResponse | null {
  if (documents.length === 0) {
    return null;
  }

  return [...documents].sort((a, b) => {
    const bTime = timestampFromDate(b.updated_at) ?? 0;
    const aTime = timestampFromDate(a.updated_at) ?? 0;
    return bTime - aTime;
  })[0] ?? null;
}

async function loadCachedBackendDocument(options: BackendDocumentLoadOptions): Promise<SavedCVDocumentResponse | null> {
  const state = loadSavedDocumentState();
  if (!state) {
    return null;
  }

  try {
    return await getCVDocument(state.documentId, { signal: options.signal });
  } catch (error) {
    if (isMissingDocumentError(error)) {
      clearSavedDocumentState();
      return null;
    }

    throw error;
  }
}

export async function loadBackendCVDocument(
  options: BackendDocumentLoadOptions = {}
): Promise<CVDocument | null> {
  const cachedDocument = await loadCachedBackendDocument(options);
  const candidates = cachedDocument
    ? [cachedDocument]
    : [
        ...listCandidateDocuments(
          await listCVDocuments({ signal: options.signal })
        ),
      ];

  for (const candidate of candidates) {
    const document = cvDocumentFromSavedResponse(candidate);
    if (!document) {
      console.warn('[cv-maker] Ignored invalid backend CV document payload.', candidate);
      continue;
    }

    saveSavedDocumentState(savedDocumentStateFromResponse(candidate));
    return document;
  }

  return null;
}

function listCandidateDocuments(documents: SavedCVDocumentResponse[]): SavedCVDocumentResponse[] {
  const mostRecent = pickMostRecentCVDocumentResponse(documents);
  if (!mostRecent) {
    return [];
  }

  return [mostRecent, ...documents.filter((document) => document.id !== mostRecent.id)];
}

export async function loadInitialCVDocument(
  options: InitialDocumentLoadOptions = {}
): Promise<CVDocument> {
  const localDocument = loadCVData();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? BACKEND_LOAD_TIMEOUT_MS
  );

  try {
    const backendDocument = await loadBackendCVDocument({ signal: controller.signal });
    if (backendDocument) {
      saveCVData(backendDocument);
      return backendDocument;
    }
  } catch (error) {
    if (isAbortError(error)) {
      console.warn('[cv-maker] Backend CV document load timed out; using local draft.');
    } else {
      console.warn('[cv-maker] Backend CV document load unavailable; using local draft.', error);
    }
  } finally {
    clearTimeout(timeout);
  }

  return localDocument;
}
