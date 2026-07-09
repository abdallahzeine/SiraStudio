interface ReorderButtonsProps {
  index: number;
  total: number;
  onMove: (delta: -1 | 1) => void;
  dragHandleProps?: Record<string, unknown>;
}

export function ReorderButtons({ index, total, onMove, dragHandleProps }: ReorderButtonsProps) {
  return (
    <div className="no-print flex flex-col gap-0.5">
      <button
        onClick={() => onMove(-1)}
        disabled={index === 0}
        title="Move up"
        className="w-8 h-8 md:w-5 md:h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none"
      >▲</button>
      {dragHandleProps && (
        <div
          {...dragHandleProps}
          title="Drag to reorder"
          className="w-8 h-8 md:w-5 md:h-4 flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-700 rounded transition-colors"
        >
          <svg className="w-3 h-3" viewBox="0 0 6 12" fill="currentColor">
            <circle cx="1.5" cy="2" r="1" />
            <circle cx="4.5" cy="2" r="1" />
            <circle cx="1.5" cy="6" r="1" />
            <circle cx="4.5" cy="6" r="1" />
            <circle cx="1.5" cy="10" r="1" />
            <circle cx="4.5" cy="10" r="1" />
          </svg>
        </div>
      )}
      <button
        onClick={() => onMove(1)}
        disabled={index === total - 1}
        title="Move down"
        className="w-8 h-8 md:w-5 md:h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none"
      >▼</button>
    </div>
  );
}

interface DeleteButtonProps {
  onClick: () => void;
  title?: string;
}

export function DeleteButton({ onClick, title = 'Delete' }: DeleteButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="no-print w-8 h-8 md:w-5 md:h-5 flex items-center justify-center text-red-300 hover:text-red-600 text-sm leading-none"
    >✕</button>
  );
}

interface AddButtonProps {
  onClick: () => void;
  label: string;
}

export function AddButton({ onClick, label }: AddButtonProps) {
  return (
    <button
      onClick={onClick}
      className="no-print mt-1 text-xs text-blue-500 hover:text-blue-700 border border-dashed border-blue-300 hover:border-blue-500 rounded px-2 py-0.5 transition-colors"
    >
      + {label}
    </button>
  );
}
