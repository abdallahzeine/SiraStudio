const STORAGE_KEY = 'side-panel-width';
const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 420;

export function clampSidePanelWidth(w: number) {
  const maxWidth = Math.max(MIN_WIDTH, Math.floor(window.innerWidth * 0.4));
  return Math.max(MIN_WIDTH, Math.min(w, maxWidth));
}

export function loadSidePanelWidth() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return clampSidePanelWidth(Number(stored));
  } catch {
    return clampSidePanelWidth(DEFAULT_WIDTH);
  }
  return clampSidePanelWidth(DEFAULT_WIDTH);
}

export function saveSidePanelWidth(w: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(w));
  } catch {
    // localStorage unavailable
  }
}