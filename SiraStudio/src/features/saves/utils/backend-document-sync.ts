import type { CVData } from '../../../shared/types';
import type { CVDocument } from '../../../app/store/types';
import { sanitizeRichText } from '../../../app/store/sanitize';
import { loadCVData, saveCVData } from '../../../shared/utils/settings';
import { builtInSectionSchemas, migrateCVData, migrateLegacyBulletEntries } from '../../../shared/utils/cvContent';
import {
  CVDocumentAPIError,
  getCVDocument,
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
const MAX_BACKEND_TITLE_LENGTH = 200;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canMigrateBackendCV(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.header) || !isRecord(value.template)) return false;

  return typeof value.header.name === 'string' &&
    typeof value.header.location === 'string' &&
    typeof value.header.phone === 'string' &&
    typeof value.header.email === 'string' &&
    Array.isArray(value.header.socialLinks) &&
    typeof value.template.id === 'string' &&
    (value.template.columns === 1 || value.template.columns === 2) &&
    Array.isArray(value.sections) &&
    value.sections.every((section) =>
      isRecord(section) &&
      typeof section.type === 'string' &&
      Object.prototype.hasOwnProperty.call(builtInSectionSchemas, section.type) &&
      Array.isArray(section.items)
    );
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
  const sanitizedName = sanitizeRichText(cv.header.name)
    .replace(/<br>|<\/(?:p|li)>/gi, ' ');
  const parsedName = new DOMParser().parseFromString(sanitizedName, 'text/html');
  const title = (parsedName.body.textContent ?? '').replace(/\s+/g, ' ').trim() || 'My CV';
  return Array.from(title).slice(0, MAX_BACKEND_TITLE_LENGTH).join('');
}

export function cvDocumentFromSavedResponse(response: SavedCVDocumentResponse): CVDocument | null {
  const bulletMigrated = migrateLegacyBulletEntries(response.cv);
  const currentData = isValidCVData(response.cv)
    ? response.cv
    : isValidCVData(bulletMigrated)
      ? bulletMigrated
      : null;
  if (currentData) {
    return {
      schemaVersion: SCHEMA_VERSION,
      revision: normalizeRevision(response.revision),
      data: currentData,
      meta: { lastSavedAt: timestampFromDate(response.updated_at) },
    };
  }

  if (!canMigrateBackendCV(response.cv)) {
    return null;
  }

  const data = migrateCVData(response.cv);
  if (!isValidCVData(data)) {
    return null;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    revision: normalizeRevision(response.revision),
    data,
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

export async function loadInitialCVDocument(
  options: InitialDocumentLoadOptions = {}
): Promise<CVDocument> {
  const localDocument = loadCVData();
  const savedState = loadSavedDocumentState();
  if (!savedState) {
    return localDocument;
  }

  const localIsNewer = localDocument.meta.lastSavedAt !== null &&
    savedState.updatedAt !== null &&
    localDocument.meta.lastSavedAt > savedState.updatedAt;
  if (savedState.dirty || localIsNewer) {
    console.warn('[cv-maker] Kept the newer local CV draft instead of replacing it with backend data.');
    return localDocument;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? BACKEND_LOAD_TIMEOUT_MS
  );

  try {
    const response = await loadCachedBackendDocument({ signal: controller.signal });
    if (!response || normalizeRevision(response.revision) <= savedState.revision) {
      return localDocument;
    }

    const backendDocument = cvDocumentFromSavedResponse(response);
    if (backendDocument) {
      saveSavedDocumentState(savedDocumentStateFromResponse(response));
      saveCVData(backendDocument);
      return backendDocument;
    }

    console.warn('[cv-maker] Ignored invalid backend CV document payload.', response);
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
