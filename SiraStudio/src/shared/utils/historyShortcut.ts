export type HistoryShortcut = 'undo' | 'redo' | null;

interface HistoryShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  defaultPrevented: boolean;
}

export function getHistoryShortcut(event: HistoryShortcutEvent): HistoryShortcut {
  if (event.defaultPrevented || !(event.ctrlKey || event.metaKey) || event.altKey) return null;

  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) return 'undo';
  if (key === 'y' || (key === 'z' && event.shiftKey)) return 'redo';
  return null;
}
