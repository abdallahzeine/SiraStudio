import { useCallback } from 'react';
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
import type { SkillGroup } from '../../../shared/types';
import { CVTextEditor } from '../editor/CVTextEditor';
import { useDndSensors } from '../editor/useDndSensors';
import { useDispatch } from '../../../app/store';
import { ReorderButtons, DeleteButton, AddButton } from './Buttons';
import { uid } from '../../../shared/utils/helpers';

interface SkillGridProps {
  path: string;
  groups: SkillGroup[];
}

function SortableSkillGroup({
  path,
  group,
  index,
  total,
  onMove,
  onDelete,
}: {
  path: string;
  group: SkillGroup;
  index: number;
  total: number;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} className="flex items-center gap-1 group animate-item-in">
      <div className="no-print flex items-center gap-1">
        <ReorderButtons
          index={index}
          total={total}
          onMove={onMove}
          dragHandleProps={{ ...listeners }}
        />
        <DeleteButton onClick={onDelete} />
      </div>
      <div className="flex items-baseline gap-1 flex-wrap">
        <div className="font-semibold">
          <CVTextEditor
            value={group.label}
            path={`${path}.label`}
            placeholder="Category"
          />
        </div>
        <span>:</span>
        <div>
          <CVTextEditor
            value={group.value}
            path={`${path}.value`}
            placeholder="skill1, skill2"
          />
        </div>
      </div>
    </div>
  );
}

export function SkillGrid({ path, groups }: SkillGridProps) {
  const dispatch = useDispatch();
  const sensors = useDndSensors();

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = groups.findIndex((g) => g.id === active.id);
      const newIndex = groups.findIndex((g) => g.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        dispatch({
          op: 'move',
          from: `${path}[${oldIndex}]`,
          path: `${path}[${newIndex}]`,
        });
      }
    }
  }, [dispatch, groups, path]);

  const addGroup = () =>
    dispatch({
      op: 'insert',
      path: `${path}[-1]`,
      value: { id: uid(), label: 'Category', value: 'Skills...' },
    });
  const deleteGroup = (idx: number) => dispatch({ op: 'delete', path: `${path}[${idx}]` });
  const moveGroup = (idx: number, delta: -1 | 1) => {
    const target = idx + delta;
    if (target < 0 || target >= groups.length) return;
    dispatch({ op: 'move', from: `${path}[${idx}]`, path: `${path}[${target}]` });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={groups.map((g) => g.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="text-gray-700 text-sm space-y-0.5">
          {groups.map((sg, idx) => (
            <SortableSkillGroup
              key={sg.id}
              path={`${path}[${idx}]`}
              group={sg}
              index={idx}
              total={groups.length}
              onMove={(d) => moveGroup(idx, d)}
              onDelete={() => deleteGroup(idx)}
            />
          ))}
          <AddButton onClick={addGroup} label="Add skill category" />
        </div>
      </SortableContext>
    </DndContext>
  );
}
