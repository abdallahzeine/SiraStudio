import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
import { Check, Link2, Settings } from 'lucide-react';
import { ReorderButtons, DeleteButton } from '../layouts/Buttons';
import { SectionRenderer } from '../engine/SectionRenderer';
import { printBlockKey, usePrintLayout } from '../printLayoutContext';
import { keepTogetherReorderPatches } from '../keepTogetherReorder';

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
  onDelete: (sectionId: string) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
}

const SortableSection = memo(function SortableSection({
  section,
  sectionIndex,
  total,
  isDeleting,
  onOpenPanel,
  onDelete,
  onMove,
}: SortableSectionProps) {
  const printLayout = usePrintLayout();
  const printKey = printBlockKey('section', section.id);
  const printSelected = printLayout.selected.has(printKey);
  const printProtected = printLayout.protectedBlocks.has(printKey);
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
    onDelete(section.id);
  }, [onDelete, section.id, total]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={`${animClass} rounded-lg ${printSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
      id={`section-${section.id}`}
    >
      <hr className="border-t border-gray-300 mb-1 md:mb-2" />
      <section className="mb-2 md:mb-3">
        <div className="flex items-center gap-1 mb-2 md:mb-3">
          <div className="no-print flex items-center gap-1">
            {printLayout.enabled ? (
              <button
                type="button"
                onClick={() => printLayout.toggle('section', section.id)}
                className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-xs font-medium ${printSelected ? 'border-blue-500 bg-blue-600 text-white' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
                aria-pressed={printSelected}
              >
                {printSelected ? <Check size={13} /> : <Link2 size={13} />}
                {printProtected ? 'Kept together' : 'Select section'}
              </button>
            ) : (
              <>
            <ReorderButtons
              index={sectionIndex}
              total={total}
              onMove={(delta) => {
                const target = sectionIndex + delta;
                if (target < 0 || target >= total) return;
                onMove(sectionIndex, target);
              }}
              dragHandleProps={{ ...listeners }}
            />
            <DeleteButton
              onClick={handleDelete}
              title="Delete section"
            />
              </>
            )}
          </div>
          <div className="text-sm md:text-lg font-bold text-gray-800 flex-1" role="heading" aria-level={2}>
            <CVTextEditor
              value={section.title}
              path={`sections[${sectionIndex}].title`}
              className="text-sm md:text-lg font-bold text-gray-800"
              placeholder="SECTION TITLE"
            />
          </div>
          {!printLayout.enabled && <button
            onClick={() => onOpenPanel('layout-settings', section.id)}
            title="Layout settings"
            className="no-print w-8 h-8 md:w-7 md:h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Settings size={16} />
          </button>}
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
  const sectionsRef = useRef(sections);

  useEffect(() => {
    sectionsRef.current = sections;
  }, [sections]);

  const handleDeleteSection = useCallback((sectionId: string) => {
    setDeletingId(sectionId);
    setTimeout(() => {
      const sectionIndex = sectionsRef.current.findIndex((section) => section.id === sectionId);
      if (sectionIndex !== -1) {
        dispatch({ op: 'delete', path: `sections[${sectionIndex}]` });
      }
      setDeletingId(null);
    }, 220);
  }, [dispatch]);

  const sensors = useDndSensors();

  const moveSection = useCallback((fromIndex: number, toIndex: number) => {
    const patches = keepTogetherReorderPatches(sections, fromIndex, toIndex, 'sections');
    if (patches.length > 0) dispatch(patches, { origin: 'editor', label: 'section:reorder' });
  }, [dispatch, sections]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((section) => section.id === active.id);
      const newIndex = sections.findIndex((section) => section.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        moveSection(oldIndex, newIndex);
      }
    }
  }, [moveSection, sections]);

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
            onMove={moveSection}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
});

SectionList.displayName = 'SectionList';
