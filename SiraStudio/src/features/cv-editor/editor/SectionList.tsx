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
