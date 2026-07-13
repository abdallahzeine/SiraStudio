import { useMemo, useState } from 'react';
import type { CVData } from '../../../shared/types';
import { deleteSnapshot, loadSnapshots, saveSnapshot } from '../utils/snapshots';

function suggestedNameFor(cv: CVData): string {
  const trimmed = cv.header.name.trim();
  return trimmed || 'My CV';
}

export function useSavesPanel(currentCVData: CVData) {
  const suggestedName = suggestedNameFor(currentCVData);
  const [snapshotCollection, setSnapshotCollection] = useState(loadSnapshots);
  const [saveName, setSaveName] = useState(suggestedName);
  const [isSaveNameDirty, setIsSaveNameDirty] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const effectiveSaveName = isSaveNameDirty ? saveName : suggestedName;

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    []
  );

  const handleSaveNameChange = (nextSaveName: string) => {
    setSaveName(nextSaveName);
    setIsSaveNameDirty(true);
  };

  const handleSave = () => {
    const normalizedName = effectiveSaveName.trim() || suggestedName;
    saveSnapshot(normalizedName, currentCVData);
    setSaveName(normalizedName);
    setIsSaveNameDirty(false);
    setConfirmDeleteId(null);
    setSnapshotCollection(loadSnapshots());
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    deleteSnapshot(id);
    setConfirmDeleteId(null);
    setSnapshotCollection(loadSnapshots());
  };

  const clearConfirmDelete = () => setConfirmDeleteId(null);

  return {
    snapshots: snapshotCollection.snapshots,
    rejectedSnapshotCount: snapshotCollection.rejectedCount,
    effectiveSaveName,
    confirmDeleteId,
    dateFormatter,
    handleSaveNameChange,
    handleSave,
    handleDelete,
    clearConfirmDelete,
  };
}
