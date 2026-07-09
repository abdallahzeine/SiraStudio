import { useEffect, useRef, useState } from 'react';
import type { CVData } from '../../../shared/types';
import { saveCVDocument } from '../api/cv-documents';
import {
  isRevisionConflictError,
  titleForCVDocument,
} from '../utils/backend-document-sync';
import {
  loadSavedDocumentState,
  savedDocumentStateFromResponse,
  saveSavedDocumentState,
  type SavedDocumentState,
} from '../utils/saved-document-state';

const AUTOSAVE_DEBOUNCE_MS = 1_200;

interface PendingBackendSave {
  cv: CVData;
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  ) || (
    error instanceof Error && error.name === 'AbortError'
  );
}

export function useBackendDocumentAutosave(cv: CVData, localRevision: number): void {
  const [initialSavedState] = useState<SavedDocumentState | null>(() => loadSavedDocumentState());
  const savedStateRef = useRef<SavedDocumentState | null>(initialSavedState);
  const pendingRef = useRef<PendingBackendSave | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveControllerRef = useRef<AbortController | null>(null);
  const isSavingRef = useRef(false);
  const hasMountedRef = useRef(false);
  const stoppedRef = useRef(false);

  useEffect(() => {
    return () => {
      stoppedRef.current = true;

      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      saveControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    pendingRef.current = { cv };

    const savePending = async (): Promise<void> => {
      if (stoppedRef.current || isSavingRef.current || !pendingRef.current) {
        return;
      }

      const pending = pendingRef.current;
      pendingRef.current = null;
      isSavingRef.current = true;

      const controller = new AbortController();
      saveControllerRef.current = controller;

      try {
        const title = titleForCVDocument(pending.cv);
        const savedState = savedStateRef.current;
        const response = await saveCVDocument(
          {
            documentId: savedState?.documentId,
            cv: pending.cv,
            title,
            base_revision: savedState?.revision,
          },
          { signal: controller.signal }
        );

        const nextSavedState = savedDocumentStateFromResponse(response);
        savedStateRef.current = nextSavedState;
        saveSavedDocumentState(nextSavedState);
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        if (isRevisionConflictError(error)) {
          console.warn(
            '[cv-maker] Backend CV autosave conflict; local edits were kept in the draft cache and were not overwritten.',
            error
          );
          return;
        }

        console.warn(
          '[cv-maker] Backend CV autosave failed; local draft cache is still available.',
          error
        );
      } finally {
        isSavingRef.current = false;
        saveControllerRef.current = null;

        if (pendingRef.current && !stoppedRef.current) {
          saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            void savePending();
          }, 0);
        }
      }
    };

    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void savePending();
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current !== null) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [cv, localRevision]);
}
