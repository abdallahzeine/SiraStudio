import { useEffect, useRef, useState } from 'react';
import type { CVData } from '../../../shared/types';
import { getCVDocument, saveCVDocument } from '../api/cv-documents';
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
    if (savedStateRef.current) {
      savedStateRef.current = { ...savedStateRef.current, dirty: true };
      saveSavedDocumentState(savedStateRef.current);
    }

    const savePending = async (): Promise<void> => {
      if (
        stoppedRef.current ||
        isSavingRef.current ||
        !pendingRef.current ||
        savedStateRef.current?.conflicted
      ) {
        return;
      }

      const pending = pendingRef.current;
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

        const hasNewerPending = pendingRef.current !== pending;
        const nextSavedState = {
          ...savedDocumentStateFromResponse(response),
          dirty: hasNewerPending,
        };
        savedStateRef.current = nextSavedState;
        saveSavedDocumentState(nextSavedState);
        if (!hasNewerPending) {
          pendingRef.current = null;
        }
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        if (isRevisionConflictError(error)) {
          const savedState = savedStateRef.current;
          if (savedState) {
            try {
              const current = await getCVDocument(savedState.documentId, { signal: controller.signal });
              savedStateRef.current = {
                ...savedDocumentStateFromResponse(current),
                dirty: true,
                conflicted: true,
              };
            } catch {
              savedStateRef.current = { ...savedState, dirty: true, conflicted: true };
            }
            saveSavedDocumentState(savedStateRef.current);
          }
          console.warn(
            '[cv-maker] Backend CV autosave conflict; local edits were kept in the draft cache and automatic backend saves were paused to avoid overwriting concurrent edits.',
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

        if (pendingRef.current && pendingRef.current !== pending && !stoppedRef.current) {
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
