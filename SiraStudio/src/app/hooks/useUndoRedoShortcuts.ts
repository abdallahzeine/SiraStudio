import { useEffect } from 'react';
import type { StoreAPI } from '../store';
import { getHistoryShortcut } from '../../shared/utils/historyShortcut';

export function useUndoRedoShortcuts(dispatch: StoreAPI['dispatch'], history: StoreAPI['history']) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = getHistoryShortcut(event);
      if (!shortcut) return;

      const isUndo = shortcut === 'undo';
      if (isUndo ? !history.canUndo : !history.canRedo) return;

      event.preventDefault();
      if (isUndo) {
        history.undo((entry) => dispatch(entry.inverse, { origin: 'undo', label: 'undo' }).success);
      } else {
        history.redo((entry) => dispatch(entry.patches, { origin: 'redo', label: 'redo' }).success);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch, history]);
}
