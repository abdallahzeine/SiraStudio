import { useEffect } from 'react';
import type { StoreAPI } from '../store';
import { getHistoryShortcut } from '../../shared/utils/historyShortcut';

export function useUndoRedoShortcuts(dispatch: StoreAPI['dispatch'], history: StoreAPI['history']) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = getHistoryShortcut(event);
      if (!shortcut) return;

      const isUndo = shortcut === 'undo';
      const entry = isUndo ? history.undo() : history.redo();
      if (!entry) return;

      event.preventDefault();
      dispatch(isUndo ? entry.inverse : entry.patches, { origin: isUndo ? 'undo' : 'redo', label: isUndo ? 'undo' : 'redo' });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, history]);
}
