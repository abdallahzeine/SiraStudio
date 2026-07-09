import type { CVData } from '../../../shared/types';

const CV_DOCUMENTS_PATH = '/api/cv-documents';

export interface SavedCVDocumentResponse {
  id: string;
  title: string | null;
  cv: CVData;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCVDocumentRequest {
  cv: CVData;
  title?: string;
}

export interface UpdateCVDocumentRequest {
  cv: CVData;
  title?: string;
  base_revision?: number;
}

export interface SaveCVDocumentRequest extends UpdateCVDocumentRequest {
  documentId?: string;
}

export type ListCVDocumentsResponse =
  | SavedCVDocumentResponse[]
  | {
      documents?: SavedCVDocumentResponse[];
      results?: SavedCVDocumentResponse[];
      data?: SavedCVDocumentResponse[];
      items?: SavedCVDocumentResponse[];
    };

interface CVDocumentRequestOptions {
  signal?: AbortSignal;
}

interface UpdateCVDocumentOptions extends CVDocumentRequestOptions {
  method?: 'PUT' | 'PATCH';
}

export class CVDocumentAPIError extends Error {
  status: number;
  responseText: string;

  constructor(status: number, responseText: string) {
    super(`CV document API error ${status}: ${responseText}`);
    this.name = 'CVDocumentAPIError';
    this.status = status;
    this.responseText = responseText;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readErrorResponse(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.trim() || res.statusText;
  } catch {
    return res.statusText;
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);

  if (!res.ok) {
    throw new CVDocumentAPIError(res.status, await readErrorResponse(res));
  }

  return res.json() as Promise<T>;
}

async function fetchNoContent(input: RequestInfo | URL, init?: RequestInit): Promise<void> {
  const res = await fetch(input, init);

  if (!res.ok) {
    throw new CVDocumentAPIError(res.status, await readErrorResponse(res));
  }
}

function documentPath(documentId: string): string {
  return `${CV_DOCUMENTS_PATH}/${encodeURIComponent(documentId)}`;
}

export function normalizeCVDocumentListResponse(payload: unknown): SavedCVDocumentResponse[] {
  if (Array.isArray(payload)) {
    return payload as SavedCVDocumentResponse[];
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ['documents', 'results', 'data', 'items']) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value as SavedCVDocumentResponse[];
    }
  }

  return [];
}

export async function listCVDocuments(options: CVDocumentRequestOptions = {}): Promise<SavedCVDocumentResponse[]> {
  const payload = await fetchJson<ListCVDocumentsResponse>(CV_DOCUMENTS_PATH, {
    method: 'GET',
    signal: options.signal,
  });

  return normalizeCVDocumentListResponse(payload);
}

export function createCVDocument(
  request: CreateCVDocumentRequest,
  options: CVDocumentRequestOptions = {}
): Promise<SavedCVDocumentResponse> {
  return fetchJson<SavedCVDocumentResponse>(CV_DOCUMENTS_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify(request),
  });
}

export function getCVDocument(
  documentId: string,
  options: CVDocumentRequestOptions = {}
): Promise<SavedCVDocumentResponse> {
  return fetchJson<SavedCVDocumentResponse>(documentPath(documentId), {
    method: 'GET',
    signal: options.signal,
  });
}

export function updateCVDocument(
  documentId: string,
  request: UpdateCVDocumentRequest,
  options: UpdateCVDocumentOptions = {}
): Promise<SavedCVDocumentResponse> {
  return fetchJson<SavedCVDocumentResponse>(documentPath(documentId), {
    method: options.method ?? 'PUT',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify(request),
  });
}

export function saveCVDocument(
  request: SaveCVDocumentRequest,
  options: UpdateCVDocumentOptions = {}
): Promise<SavedCVDocumentResponse> {
  if (request.documentId) {
    return updateCVDocument(
      request.documentId,
      {
        cv: request.cv,
        title: request.title,
        base_revision: request.base_revision,
      },
      options
    );
  }

  return createCVDocument(
    {
      cv: request.cv,
      title: request.title,
    },
    options
  );
}

export function deleteCVDocument(
  documentId: string,
  options: CVDocumentRequestOptions = {}
): Promise<void> {
  return fetchNoContent(documentPath(documentId), {
    method: 'DELETE',
    signal: options.signal,
  });
}
