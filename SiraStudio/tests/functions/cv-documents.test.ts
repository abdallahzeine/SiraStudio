import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CVDocumentAPIError,
  normalizeCVDocumentListResponse,
  updateCVDocument,
  type SavedCVDocumentResponse,
} from '../../src/features/saves/api/cv-documents';
import { initialCVData } from '../../src/features/cv-editor/data/initialCVData';
import {
  cvDocumentFromSavedResponse,
  isRevisionConflictError,
  pickMostRecentCVDocumentResponse,
  titleForCVDocument,
} from '../../src/features/saves/utils/backend-document-sync';

function makeDocument(overrides: Partial<SavedCVDocumentResponse> = {}): SavedCVDocumentResponse {
  return {
    id: 'doc-1',
    title: 'My CV',
    cv: initialCVData,
    revision: 1,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('CV document API helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes list responses from arrays or document containers', () => {
    const first = makeDocument({ id: 'doc-1' });
    const second = makeDocument({ id: 'doc-2' });

    expect(normalizeCVDocumentListResponse([first])).toEqual([first]);
    expect(normalizeCVDocumentListResponse({ documents: [second] })).toEqual([second]);
    expect(normalizeCVDocumentListResponse({ results: [first, second] })).toEqual([first, second]);
    expect(normalizeCVDocumentListResponse({ unexpected: [] })).toEqual([]);
  });

  it('selects the newest backend document by updated timestamp', () => {
    const older = makeDocument({ id: 'older', updated_at: '2026-01-01T00:00:00.000Z' });
    const newer = makeDocument({ id: 'newer', updated_at: '2026-01-02T00:00:00.000Z' });

    expect(pickMostRecentCVDocumentResponse([older, newer])).toBe(newer);
  });

  it('converts valid backend responses to local CV documents', () => {
    const response = makeDocument({ revision: 7 });

    expect(cvDocumentFromSavedResponse(response)).toMatchObject({
      schemaVersion: 1,
      revision: 7,
      data: initialCVData,
    });
  });

  it('rejects invalid backend CV payloads', () => {
    const response = makeDocument({ cv: {} as SavedCVDocumentResponse['cv'] });

    expect(cvDocumentFromSavedResponse(response)).toBeNull();
  });

  it('uses PUT when updating saved documents by default', async () => {
    const response = makeDocument({ revision: 2 });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await updateCVDocument('doc-1', { cv: initialCVData, base_revision: 1 });

    expect(fetchMock).toHaveBeenCalledWith('/api/cv-documents/doc-1', expect.objectContaining({ method: 'PUT' }));
  });

  it('recognizes revision conflict API errors', () => {
    expect(isRevisionConflictError(new CVDocumentAPIError(409, 'Conflict'))).toBe(true);
    expect(isRevisionConflictError(new CVDocumentAPIError(412, 'Precondition Failed'))).toBe(true);
    expect(isRevisionConflictError(new CVDocumentAPIError(500, 'Server Error'))).toBe(false);
  });

  it('uses the CV header name as the saved document title', () => {
    expect(titleForCVDocument(initialCVData)).toBe('Abdallah Zeine Elabidine');
    expect(titleForCVDocument({ ...initialCVData, header: { ...initialCVData.header, name: '  ' } })).toBe('My CV');
  });
});
