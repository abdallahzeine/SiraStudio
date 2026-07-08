import { memo, useCallback, useState } from 'react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CVSection } from '../../../shared/types';
import { useDispatch } from '../../../app/store';
import { CVTextEditor } from './CVTextEditor';
import { useDndSensors } from './useDndSensors';
import { ReorderButtons, DeleteButton } from '../layouts/Buttons';
import { SectionRenderer } from '../engine/SectionRenderer';
import { fieldString } from '../../../shared/utils/cvContent';

interface SectionListProps {
  sections: CVSection[];
  onOpenPanel: (type: 'layout-settings', sectionId?: string) => void;
}

interface SortableSectionProps {
  section: CVSection;
  sectionIndex: number;
  total: number;
  isDeleting: boolean;
  onOpenPanel: (type: 'layout-settings', sectionId?: string) => void;
  onDelete: (sectionId: string, sectionIndex: number) => void;
}

const SPACER_SIZES = [
  { label: 'XS', value: '8' },
  { label: 'S', value: '16' },
  { label: 'M', value: '32' },
  { label: 'L', value: '56' },
  { label: 'XL', value: '80' },
];

function plainText(value: string | undefined): string {
  return (value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function SpacerSectionEditor({
  section,
  sectionIndex,
  total,
  listeners,
  onDelete,
}: {
  section: CVSection;
  sectionIndex: number;
  total: number;
  listeners: Record<string, unknown>;
  onDelete: () => void;
}) {
  const dispatch = useDispatch();
  const currentValue = plainText(section.content.items[0] ? fieldString(section.content.items[0], 'body') : undefined) || '32';
  const height = Number.parseInt(currentValue, 10);

  const setSpacerHeight = useCallback((value: string) => {
    const first = section.content.items[0];
    if (first) {
      dispatch({
        op: 'replace',
        path: `sections[${sectionIndex}].content.items[0]`,
        value: { ...first, fields: { ...first.fields, body: value } },
      });
      return;
    }

    dispatch({
      op: 'insert',
      path: `sections[${sectionIndex}].content.items[-1]`,
      value: { id: `spacer-${section.id}`, fields: { body: value } },
    });
  }, [dispatch, section, sectionIndex]);

  return (
    <>
      <div style={{ height: Number.isFinite(height) ? height : 32 }} className="hidden print:block" />
      <div className="no-print my-1 border-2 border-dashed border-violet-200 rounded-lg flex items-center gap-2 px-3 py-1.5 bg-violet-50/30">
        <div className="flex items-center gap-1 shrink-0">
          <ReorderButtons
            index={sectionIndex}
            total={total}
            onMove={(delta) => {
              const target = sectionIndex + delta;
              if (target < 0 || target >= total) return;
              dispatch({
                op: 'move',
                from: `sections[${sectionIndex}]`,
                path: `sections[${target}]`,
              });
            }}
            dragHandleProps={{ ...listeners }}
          />
          <DeleteButton
            onClick={() => { if (total > 1) onDelete(); }}
            title="Delete spacer"
          />
        </div>
        <span className="text-xs text-violet-400 font-medium shrink-0">Spacer:</span>
        <div className="flex gap-1">
          {SPACER_SIZES.map((size) => (
            <button
              key={size.value}
              onClick={() => setSpacerHeight(size.value)}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                currentValue === size.value
                  ? 'border-violet-500 bg-violet-500 text-white'
                  : 'border-violet-200 text-violet-500 hover:border-violet-400'
              }`}
            >
              {size.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

const SortableSection = memo(function SortableSection({
  section,
  sectionIndex,
  total,
  isDeleting,
  onOpenPanel,
  onDelete,
}: SortableSectionProps) {
  const dispatch = useDispatch();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const animClass = isDeleting ? 'animate-section-out' : 'animate-section-in';
  const handleDelete = useCallback(() => {
    if (total <= 1) return;
    onDelete(section.id, sectionIndex);
  }, [onDelete, section.id, sectionIndex, total]);

  if (section.type === 'spacer') {
    return (
      <div ref={setNodeRef} style={style} {...attributes} className={animClass} id={`section-${section.id}`}>
        <SpacerSectionEditor
          section={section}
          sectionIndex={sectionIndex}
          total={total}
          listeners={{ ...listeners }}
          onDelete={handleDelete}
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} className={animClass} id={`section-${section.id}`}>
      <hr className="border-t border-gray-300 mb-1 md:mb-2" />
      <section className="mb-2 md:mb-3">
        <div className="flex items-center gap-1 mb-2 md:mb-3">
          <div className="no-print flex items-center gap-1">
            <ReorderButtons
              index={sectionIndex}
              total={total}
              onMove={(delta) => {
                const target = sectionIndex + delta;
                if (target < 0 || target >= total) return;
                dispatch({
                  op: 'move',
                  from: `sections[${sectionIndex}]`,
                  path: `sections[${target}]`,
                });
              }}
              dragHandleProps={{ ...listeners }}
            />
            <DeleteButton
              onClick={handleDelete}
              title="Delete section"
            />
          </div>
          <div className="text-sm md:text-lg font-bold text-gray-800 flex-1" role="heading" aria-level={2}>
            <CVTextEditor
              value={section.title}
              path={`sections[${sectionIndex}].title`}
              className="text-sm md:text-lg font-bold text-gray-800"
              placeholder="SECTION TITLE"
            />
          </div>
          <button
            onClick={() => onOpenPanel('layout-settings', section.id)}
            title="Layout settings"
            className="no-print w-8 h-8 md:w-7 md:h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
        <SectionRenderer sectionIndex={sectionIndex} section={section} />
      </section>
    </div>
  );
});

SortableSection.displayName = 'SortableSection';

export const SectionList = memo(function SectionList({ sections, onOpenPanel }: SectionListProps) {
  const dispatch = useDispatch();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteSection = useCallback((sectionId: string, sectionIndex: number) => {
    setDeletingId(sectionId);
    setTimeout(() => {
      dispatch({ op: 'delete', path: `sections[${sectionIndex}]` });
      setDeletingId(null);
    }, 220);
  }, [dispatch]);

  const sensors = useDndSensors();

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((section) => section.id === active.id);
      const newIndex = sections.findIndex((section) => section.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        dispatch({
          op: 'move',
          from: `sections[${oldIndex}]`,
          path: `sections[${newIndex}]`,
        });
      }
    }
  }, [dispatch, sections]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={sections.map((section) => section.id)}
        strategy={verticalListSortingStrategy}
      >
        {sections.map((section, sectionIndex) => (
          <SortableSection
            key={section.id}
            section={section}
            sectionIndex={sectionIndex}
            total={sections.length}
            isDeleting={deletingId === section.id}
            onOpenPanel={onOpenPanel}
            onDelete={handleDeleteSection}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
});

SectionList.displayName = 'SectionList';
