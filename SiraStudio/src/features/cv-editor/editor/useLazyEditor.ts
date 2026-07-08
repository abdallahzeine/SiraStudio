import { useCallback, useEffect, useRef, useState } from 'react';

interface UseLazyEditorOptions {
  lazy?: boolean;
  threshold?: number;
  rootMargin?: string;
}

interface UseLazyEditorResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  shouldMount: boolean;
  activate: () => void;
}

export function useLazyEditor(options: UseLazyEditorOptions = {}): UseLazyEditorResult {
  const {
    lazy = true,
    threshold = 0,
    rootMargin = '200px',
  } = options;

  const supportsIntersectionObserver = typeof window !== 'undefined' && 'IntersectionObserver' in window;
  const shouldObserve = lazy && supportsIntersectionObserver;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activated, setActivated] = useState(() => !shouldObserve);
  const shouldMount = !shouldObserve || activated;

  const activate = useCallback(() => {
    setActivated(true);
  }, []);

  useEffect(() => {
    if (!shouldObserve || shouldMount) {
      return;
    }

    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          setActivated(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin, shouldMount, shouldObserve, threshold]);

  return {
    containerRef,
    shouldMount,
    activate,
  };
}
