import { useEffect } from 'react';

export function usePendingSectionScroll(pendingScrollId: string | null, setPendingScrollId: (id: string | null) => void) {
  useEffect(() => {
    if (!pendingScrollId) return;

    const timer = setTimeout(() => {
      document.getElementById(`section-${pendingScrollId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setPendingScrollId(null);
    }, 50);

    return () => clearTimeout(timer);
  }, [pendingScrollId, setPendingScrollId]);
}
