import { useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { CVSection, CVItem } from '../../../shared/types';
import { sectionRegistry } from '../sections/registry';
import { useDispatch } from '../../../app/store';
import { AddButton } from '../layouts/Buttons';
import { useDndSensors } from '../editor/useDndSensors';
import { ItemLinksProvider } from '../ItemLinks';
import { keepTogetherReorderPatches } from '../keepTogetherReorder';

interface SectionRendererProps {
  sectionIndex: number;
  section: CVSection;
}

export function SectionRenderer({
  sectionIndex,
  section,
}: SectionRendererProps) {
  const dispatch = useDispatch();
  const def = sectionRegistry[section.type] ?? sectionRegistry.custom;
  const renderEditor = def.renderItemEditor ?? def.renderItem;
  const { layout, content } = section;
  const { items, schema } = content;
  const visibleItems = def.singleItem ? items.slice(0, 1) : items;

  const sensors = useDndSensors();

  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    const itemsPath = `sections[${sectionIndex}].content.items`;
    const patches = keepTogetherReorderPatches(items, fromIndex, toIndex, itemsPath);
    if (patches.length > 0) dispatch(patches, { origin: 'editor', label: 'item:reorder' });
  }, [dispatch, items, sectionIndex]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        moveItem(oldIndex, newIndex);
      }
    }
  }, [items, moveItem]);

  const onChangeItem = useCallback((index: number, item: CVItem) => {
    dispatch({ op: 'replace', path: `sections[${sectionIndex}].content.items[${index}]`, value: item });
  }, [dispatch, sectionIndex]);

  const onMoveItem = useCallback((index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    moveItem(index, target);
  }, [items.length, moveItem]);

  const onDeleteItem = useCallback((index: number) => {
    if (index < 0 || index >= items.length) return;
    dispatch({ op: 'delete', path: `sections[${sectionIndex}].content.items[${index}]` });
  }, [dispatch, items.length, sectionIndex]);

  const onAddItem = useCallback(() => {
    dispatch({
      op: 'insert',
      path: `sections[${sectionIndex}].content.items[-1]`,
      value: section.type === 'custom' ? def.newItem(schema) : def.newItem(),
    });
  }, [def, dispatch, schema, section.type, sectionIndex]);

  if (!renderEditor) {
    return null;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={visibleItems.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        {visibleItems.map((item, idx) => (
          <ItemLinksProvider key={item.id} links={item.links}>
            {renderEditor({
              item,
              section,
              layout,
              sectionIndex,
              index: idx,
              total: items.length,
              itemPath: `sections[${sectionIndex}].content.items[${idx}]`,
              onChange: (i: CVItem) => onChangeItem(idx, i),
              onMove: (d: -1 | 1) => onMoveItem(idx, d),
              onDelete: () => onDeleteItem(idx),
              schema,
            })}
          </ItemLinksProvider>
        ))}
      </SortableContext>
      {!def.singleItem && (
        <AddButton onClick={onAddItem} label={def.addItemLabel} />
      )}
    </DndContext>
  );
}
