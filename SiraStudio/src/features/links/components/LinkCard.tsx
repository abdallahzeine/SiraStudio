import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Trash2, X } from 'lucide-react';
import type { SocialLink } from '../../../shared/types';
import { getIconColor, LinkTypeIcon } from '../icons';
import { extractDomain } from '../utils/linkValidation';

interface LinkCardProps {
  link: SocialLink;
  onEdit: () => void;
  onArmDelete: () => void;
  isPendingDelete?: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  layout?: 'compact' | 'grid' | 'list';
}

function DragHandle({
  attributes,
  listeners,
  compact,
}: {
  attributes: React.HTMLAttributes<HTMLElement>;
  listeners?: React.HTMLAttributes<HTMLElement>;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      {...attributes}
      {...listeners}
      className={
        compact
          ? 'link-action-btn flex h-4 w-4 cursor-grab items-center justify-center rounded-full bg-white text-gray-400 shadow-sm ring-1 ring-gray-200 hover:text-gray-600 active:cursor-grabbing'
          : 'link-action-btn flex h-7 w-7 cursor-grab items-center justify-center rounded-md text-gray-300 hover:bg-gray-100 hover:text-gray-500 active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-[#0078D7]'
      }
      aria-label="Drag to reorder"
      title="Drag to reorder"
    >
      <GripVertical size={compact ? 10 : 14} />
    </button>
  );
}

function DeleteAction({
  label,
  isPending,
  onArm,
  onConfirm,
  onCancel,
  compact,
}: {
  label: string;
  isPending: boolean;
  onArm: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  if (isPending) {
    return (
      <div className={`link-actions-enter no-print flex items-center ${compact ? 'gap-0.5' : 'gap-1'}`}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className={
            compact
              ? 'link-action-btn flex h-4 w-4 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50'
              : 'link-action-btn rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#0078D7]'
          }
          aria-label={`Cancel deleting ${label}`}
          title="Cancel"
        >
          {compact ? <X size={10} /> : 'Cancel'}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onConfirm();
          }}
          className={
            compact
              ? 'link-action-btn link-confirm-pop flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700'
              : 'link-action-btn link-confirm-pop rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500'
          }
          aria-label={`Confirm deletion of ${label}`}
          title="Confirm delete"
        >
          {compact ? <Trash2 size={10} /> : 'Delete'}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onArm();
      }}
      className={
        compact
          ? 'link-action-btn flex h-4 w-4 items-center justify-center rounded-full bg-white text-red-400 shadow-sm ring-1 ring-gray-200 hover:bg-red-50 hover:text-red-600'
          : 'link-action-btn flex h-7 w-7 items-center justify-center rounded-md text-red-300 hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-400'
      }
      aria-label={`Delete ${label}`}
      title="Delete"
    >
      {compact ? <X size={10} strokeWidth={2.5} /> : <Trash2 size={14} />}
    </button>
  );
}

export function LinkCard({
  link,
  onEdit,
  onArmDelete,
  isPendingDelete = false,
  onConfirmDelete,
  onCancelDelete,
  layout = 'compact',
}: LinkCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const domain = extractDomain(link.url);
  const label = link.label || domain;
  const iconColor = getIconColor(link.iconType, link.color);

  const handleBodyClick = () => {
    if (isPendingDelete) onCancelDelete();
    else onEdit();
  };

  if (layout === 'compact') {
    return (
      <>
        <div
          ref={setNodeRef}
          style={style}
          className={`group relative no-print inline-flex ${isDragging ? 'link-dragging' : ''}`}
        >
          <button
            type="button"
            onClick={handleBodyClick}
            className={`icon-button relative flex h-9 w-9 items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-[#0078D7] focus:ring-offset-2 ${
              isPendingDelete
                ? 'bg-red-50 ring-2 ring-red-400'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
            style={{ color: isPendingDelete ? '#dc2626' : iconColor }}
            aria-label={`Edit ${label} link`}
            title={label}
          >
            <LinkTypeIcon type={link.iconType} customIconUrl={link.customIconUrl} size={20} color={isPendingDelete ? '#dc2626' : iconColor} />
          </button>

          <div
            className={`absolute -bottom-1 left-1/2 z-20 flex -translate-x-1/2 items-center gap-0.5 transition-all duration-200 ease-out motion-reduce:transition-none ${
              isPendingDelete
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100'
            }`}
          >
            {!isPendingDelete && (
              <DragHandle attributes={attributes} listeners={listeners} compact />
            )}
            <DeleteAction
              label={label}
              isPending={isPendingDelete}
              onArm={onArmDelete}
              onConfirm={onConfirmDelete}
              onCancel={onCancelDelete}
              compact
            />
          </div>
        </div>

        <a
          href={link.url}
          className="hidden print:inline-flex print:items-center print:gap-1 print:text-sm print:text-gray-700"
          style={{ color: 'black' }}
        >
          <LinkTypeIcon type={link.iconType} customIconUrl={link.customIconUrl} size={16} color="black" />
          <span className="print:underline">{label}</span>
        </a>
      </>
    );
  }

  if (layout === 'grid') {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`link-card group relative rounded-xl border bg-white p-4 hover:shadow-lg ${
          isDragging ? 'link-dragging' : ''
        } ${
          isPendingDelete
            ? 'border-red-300 ring-1 ring-red-200'
            : 'border-gray-200 hover:border-blue-300'
        }`}
      >
        <button
          type="button"
          onClick={handleBodyClick}
          className="w-full text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0078D7]"
          aria-label={`Edit ${label} link`}
        >
          <div
            className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full"
            style={{ backgroundColor: `${iconColor}15`, color: iconColor }}
          >
            <LinkTypeIcon type={link.iconType} customIconUrl={link.customIconUrl} size={24} color={iconColor} />
          </div>
          <span className="block w-full truncate text-sm font-medium text-gray-700">{label}</span>
          <span className="mt-0.5 block w-full truncate text-xs text-gray-400">{domain}</span>
        </button>

        <div
          className={`no-print mt-3 flex items-center justify-center gap-1 transition-all duration-200 ease-out motion-reduce:transition-none ${
            isPendingDelete
              ? 'translate-y-0 opacity-100'
              : 'pointer-events-none translate-y-1 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100'
          }`}
        >
          {!isPendingDelete && (
            <DragHandle attributes={attributes} listeners={listeners} />
          )}
          <DeleteAction
            label={label}
            isPending={isPendingDelete}
            onArm={onArmDelete}
            onConfirm={onConfirmDelete}
            onCancel={onCancelDelete}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`link-card group flex items-center gap-2 rounded-lg border bg-white p-3 hover:shadow-md ${
        isDragging ? 'link-dragging' : ''
      } ${
        isPendingDelete
          ? 'border-red-300 ring-1 ring-red-200'
          : 'border-gray-200 hover:border-blue-300'
      }`}
    >
      <button
        type="button"
        onClick={handleBodyClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0078D7]"
        aria-label={`Edit ${label} link`}
      >
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${iconColor}15`, color: iconColor }}
        >
          <LinkTypeIcon type={link.iconType} customIconUrl={link.customIconUrl} size={20} color={iconColor} />
        </div>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-gray-700">{label}</span>
          <span className="block truncate text-xs text-gray-400">{domain}</span>
        </span>
      </button>

      <div
        className={`no-print flex shrink-0 items-center gap-0.5 transition-all duration-200 ease-out motion-reduce:transition-none ${
          isPendingDelete
            ? 'translate-x-0 opacity-100'
            : 'pointer-events-none translate-x-1 opacity-0 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100 sm:pointer-events-auto sm:translate-x-0 sm:opacity-100'
        }`}
      >
        {!isPendingDelete && (
          <DragHandle attributes={attributes} listeners={listeners} />
        )}
        <DeleteAction
          label={label}
          isPending={isPendingDelete}
          onArm={onArmDelete}
          onConfirm={onConfirmDelete}
          onCancel={onCancelDelete}
        />
      </div>
    </div>
  );
}
