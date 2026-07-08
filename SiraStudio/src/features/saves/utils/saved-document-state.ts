import type { SavedCVDocumentResponse } from '../api/cv-documents';

export interface SavedDocumentState {
  documentId: string;
  revision: number;
  updatedAt: number | null;
}

const SAVED_DOCUMENT_STATE_KEY = 'cv-maker-saved-document-state';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRevision(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
}

function normalizeUpdatedAt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function normalizeSavedDocumentState(value: unknown): SavedDocumentState | null {
  if (!isRecord(value)) {
    return null;
  }

  const documentId = typeof value.documentId === 'string' ? value.documentId : null;
  const revision = normalizeRevision(value.revision);

  if (!documentId || revision === null) {
    return null;
  }

  return {
    documentId,
    revision,
    updatedAt: normalizeUpdatedAt(value.updatedAt),
  };
}

export function loadSavedDocumentState(): SavedDocumentState | null {
  try {
    const stored = localStorage.getItem(SAVED_DOCUMENT_STATE_KEY);
    if (!stored) {
      return null;
    }

    return normalizeSavedDocumentState(JSON.parse(stored) as unknown);
  } catch {
    return null;
  }
}

export function saveSavedDocumentState(state: SavedDocumentState): void {
  try {
    localStorage.setItem(SAVED_DOCUMENT_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save CV document sync state to localStorage:', error);
  }
}

export function clearSavedDocumentState(): void {
  try {
    localStorage.removeItem(SAVED_DOCUMENT_STATE_KEY);
  } catch {
    // Ignore localStorage cleanup errors; CV draft persistence is handled separately.
  }
}

export function savedDocumentStateFromResponse(response: SavedCVDocumentResponse): SavedDocumentState {
  return {
    documentId: String(response.id),
    revision: normalizeRevision(response.revision) ?? 0,
    updatedAt: Date.now(),
  };
}
