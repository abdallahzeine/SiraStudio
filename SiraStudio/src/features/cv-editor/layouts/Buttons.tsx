import { ChevronDown, ChevronUp, GripVertical, Plus, X } from 'lucide-react';

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
        className="flex h-8 w-8 items-center justify-center text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-20 md:h-5 md:w-5"
      >
        <ChevronUp size={14} />
      </button>
      {dragHandleProps && (
        <div
          {...dragHandleProps}
          title="Drag to reorder"
          className="flex h-8 w-8 cursor-grab items-center justify-center rounded text-gray-400 transition-colors hover:text-gray-700 active:cursor-grabbing md:h-4 md:w-5"
        >
          <GripVertical size={12} />
        </div>
      )}
      <button
        onClick={() => onMove(1)}
        disabled={index === total - 1}
        title="Move down"
        className="flex h-8 w-8 items-center justify-center text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-20 md:h-5 md:w-5"
      >
        <ChevronDown size={14} />
      </button>
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
      className="no-print flex h-8 w-8 items-center justify-center text-red-300 hover:text-red-600 md:h-5 md:w-5"
    >
      <X size={14} />
    </button>
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
      className="no-print mt-1 inline-flex items-center gap-1 rounded border border-dashed border-blue-300 px-2 py-0.5 text-xs text-[#0078D7] transition-colors hover:border-[#0078D7] hover:text-blue-700"
    >
      <Plus size={12} />
      {label}
    </button>
  );
}
