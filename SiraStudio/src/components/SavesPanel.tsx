import { useMemo, useState } from 'react';
import type { CVData } from '../types';
import { deleteSnapshot, loadSnapshots, saveSnapshot, type CVSnapshot } from '../utils/snapshots';

interface SavesPanelProps {
  currentCVData: CVData;
  onLoadSnapshot: (data: CVData) => void;
  onLoadBlank: () => void;
  onShowTutorial?: () => void;
}

function suggestedNameFor(cv: CVData): string {
  const trimmed = cv.header.name.trim();
  return trimmed || 'My CV';
}

export function SavesPanel({ currentCVData, onLoadSnapshot, onLoadBlank, onShowTutorial }: SavesPanelProps) {
  const suggestedName = suggestedNameFor(currentCVData);
  const [snapshots, setSnapshots] = useState<CVSnapshot[]>(() => loadSnapshots());
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

  const handleSave = () => {
    const normalizedName = effectiveSaveName.trim() || suggestedName;
    saveSnapshot(normalizedName, currentCVData);
    setSaveName(normalizedName);
    setIsSaveNameDirty(false);
    setConfirmDeleteId(null);
    setSnapshots(loadSnapshots());
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }

    deleteSnapshot(id);
    setConfirmDeleteId(null);
    setSnapshots(loadSnapshots());
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-800">Load Blank CV</h3>
        <button
          onClick={onLoadBlank}
          className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors"
        >
          Start from blank
        </button>
        <p className="text-xs text-gray-500">Replace current content with a clean starter CV.</p>
      </section>

      <div className="h-px bg-gray-200" />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-800">Save Current</h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={effectiveSaveName}
            onChange={(event) => {
              setSaveName(event.target.value);
              setIsSaveNameDirty(true);
            }}
            placeholder="Snapshot name"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
          />
          <button
            onClick={handleSave}
            className="shrink-0 px-3 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
          >
            Save
          </button>
        </div>
        {onShowTutorial && (
          <button
            onClick={onShowTutorial}
            className="text-xs text-violet-600 hover:text-violet-700 underline underline-offset-2"
          >
            Want to see how to save as PDF?
          </button>
        )}
      </section>

      <div className="h-px bg-gray-200" />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-gray-800">Saved Snapshots</h3>
        {snapshots.length === 0 ? (
          <p className="text-sm text-gray-500">No saved snapshots yet.</p>
        ) : (
          <div className="space-y-2">
            {snapshots.map((snapshot) => {
              const isConfirmingDelete = confirmDeleteId === snapshot.id;
              return (
                <article key={snapshot.id} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{snapshot.name || 'Untitled snapshot'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{dateFormatter.format(snapshot.savedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setConfirmDeleteId(null);
                          onLoadSnapshot(snapshot.data);
                        }}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Load
                      </button>
                      <button
                        onClick={() => handleDelete(snapshot.id)}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                          isConfirmingDelete
                            ? 'border-red-500 bg-red-500 text-white hover:bg-red-600'
                            : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                        }`}
                      >
                        {isConfirmingDelete ? 'Confirm?' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
