const TUTORIAL_SEEN_KEY = 'cv-maker-seen-print-tutorial';

export function hasSeenPrintTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markPrintTutorialSeen(): void {
  try {
    localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    // localStorage unavailable
  }
}
