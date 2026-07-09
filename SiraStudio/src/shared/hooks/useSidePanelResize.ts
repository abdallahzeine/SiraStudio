import { useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { clampSidePanelWidth } from '../utils/sidePanel';

export function useSidePanelResize(width: number, onWidthChange: (w: number) => void) {
  const resizeStart = useRef<{ x: number; w: number } | null>(null);

  const handleResizeStart = useCallback((event: ReactMouseEvent) => {
    event.preventDefault();
    resizeStart.current = { x: event.clientX, w: width };
    document.body.classList.add('side-panel-resizing');

    const handleMove = (moveEvent: MouseEvent) => {
      const start = resizeStart.current;
      if (!start) return;
      onWidthChange(clampSidePanelWidth(start.w + (start.x - moveEvent.clientX)));
    };

    const handleUp = () => {
      resizeStart.current = null;
      document.body.classList.remove('side-panel-resizing');
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [width, onWidthChange]);

  return handleResizeStart;
}
