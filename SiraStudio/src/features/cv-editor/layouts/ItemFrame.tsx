import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Density } from '../../../shared/types';
import { useChangeHighlight } from '../../../app/store';
import { ReorderButtons, DeleteButton } from './Buttons';
import { CurrentItemLinks } from '../ItemLinks';
import { printBlockKey, usePrintLayout } from '../printLayoutContext';

interface ItemFrameProps {
  itemId: string;
  density: Density;
  index: number;
  total: number;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
  children: React.ReactNode;
  hideControls?: boolean;
  path?: string;
}

const densityClass: Record<Density, string> = {
  compact: 'mb-0.5 md:mb-1',
  normal: 'mb-1 md:mb-2',
  relaxed: 'mb-2 md:mb-4',
};

export function ItemFrame({ itemId, density, index, total, onMove, onDelete, children, hideControls = false, path }: ItemFrameProps) {
  const printLayout = usePrintLayout();
  const printKey = printBlockKey('item', itemId);
  const printSelected = printLayout.selected.has(printKey);
  const printProtected = printLayout.protectedBlocks.has(printKey);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: itemId });

  const highlight = useChangeHighlight(path);

  const baseTransform = CSS.Transform.toString(transform);
  const style: React.CSSProperties = {
    transform: isDragging ? `${baseTransform ?? ''} scale(1.02)`.trim() : (baseTransform ?? undefined),
    transition,
    opacity: isDragging ? 0.85 : 1,
    boxShadow: isDragging ? '0 8px 25px rgba(0,0,0,0.12)' : undefined,
    zIndex: isDragging ? 10 : undefined,
    position: isDragging ? 'relative' : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onPointerDownCapture={printLayout.enabled ? (event) => event.preventDefault() : undefined}
      onClickCapture={printLayout.enabled ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        printLayout.toggle('item', itemId);
      } : undefined}
      onKeyDown={printLayout.enabled ? (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        printLayout.toggle('item', itemId);
      } : undefined}
      aria-label={printLayout.enabled ? `Select CV entry for page-break layout${printProtected ? ', currently kept together' : ''}` : undefined}
      className={`group relative animate-item-in rounded-lg ${densityClass[density]} ${highlight ? 'change-highlight' : ''} ${printLayout.enabled ? 'cursor-pointer select-none' : ''} ${printSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
    >
      {printLayout.enabled && (
        <span className={`no-print absolute right-1 top-1 z-10 rounded-full px-2 py-0.5 text-[10px] font-semibold ${printSelected ? 'bg-blue-600 text-white' : printProtected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
          {printSelected ? 'Selected' : printProtected ? 'Kept together' : 'Select'}
        </span>
      )}
      <div className="flex items-start gap-1">
        {!hideControls && !printLayout.enabled && (
          <div className="no-print flex items-center gap-0.5 md:gap-1 pt-0.5 shrink-0">
            <ReorderButtons
              index={index}
              total={total}
              onMove={onMove}
              dragHandleProps={{ ...listeners }}
            />
            <DeleteButton onClick={onDelete} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {children}
          <CurrentItemLinks />
        </div>
      </div>
    </div>
  );
}
