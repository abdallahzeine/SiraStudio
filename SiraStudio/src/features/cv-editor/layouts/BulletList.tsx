import { useCallback, useMemo } from 'react';
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
import type { IconStyle } from '../../../shared/types';
import { CVTextEditor } from '../editor/CVTextEditor';
import { useDndSensors } from '../editor/useDndSensors';
import { useDispatch } from '../../../app/store';
import { ReorderButtons, DeleteButton, AddButton } from './Buttons';

interface BulletListProps {
  bullets: string[];
  bulletsPath: string;
  iconStyle: IconStyle;
}

const iconChar: Record<IconStyle, string> = {
  none: '',
  bullet: '•',
  dash: '–',
  chevron: '›',
};

function SortableBullet({
  bulletId,
  icon,
  value,
  path,
  index,
  total,
  onMove,
  onDelete,
}: {
  bulletId: string;
  icon: string;
  value: string;
  path: string;
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
  } = useSortable({ id: bulletId });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li ref={setNodeRef} style={style} {...attributes} className="flex items-start gap-1 group/bullet animate-item-in">
      {icon && <span className="shrink-0 select-none mt-0.5">{icon}</span>}
      <div className="no-print flex items-center gap-0.5 shrink-0">
        <ReorderButtons
          index={index}
          total={total}
          onMove={onMove}
          dragHandleProps={{ ...listeners }}
        />
        <DeleteButton onClick={onDelete} title="Delete bullet" />
      </div>
      <CVTextEditor
        multiline
        value={value}
        path={path}
        placeholder="Bullet point..."
        className="flex-1"
      />
    </li>
  );
}

export function BulletList({ bullets, bulletsPath, iconStyle }: BulletListProps) {
  const dispatch = useDispatch();
  const icon = iconChar[iconStyle];

  const bulletIds = useMemo(
    () => bullets.map((_, i) => `bullet-${i}`),
    [bullets]
  );

  const sensors = useDndSensors();

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = bulletIds.indexOf(active.id as string);
      const newIndex = bulletIds.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        dispatch({
          op: 'move',
          from: `${bulletsPath}[${oldIndex}]`,
          path: `${bulletsPath}[${newIndex}]`,
        });
      }
    }
  }, [bulletIds, bulletsPath, dispatch]);

  const addBullet = () => dispatch({ op: 'insert', path: `${bulletsPath}[-1]`, value: 'New bullet point.' });
  const deleteBullet = (i: number) => dispatch({ op: 'delete', path: `${bulletsPath}[${i}]` });
  const moveBullet = (i: number, delta: -1 | 1) => {
    const target = i + delta;
    if (target < 0 || target >= bullets.length) return;
    dispatch({
      op: 'move',
      from: `${bulletsPath}[${i}]`,
      path: `${bulletsPath}[${target}]`,
    });
  };

  return (
    <div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={bulletIds} strategy={verticalListSortingStrategy}>
          <ul className={`${icon ? 'list-none' : ''} ml-${icon ? '8' : '0'} text-gray-700 text-sm mt-0.5 space-y-0.5`}>
            {bullets.map((b, i) => (
              <SortableBullet
                key={bulletIds[i]}
                bulletId={bulletIds[i]}
                icon={icon}
                value={b}
                path={`${bulletsPath}[${i}]`}
                index={i}
                total={bullets.length}
                onMove={(d) => moveBullet(i, d)}
                onDelete={() => deleteBullet(i)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <AddButton onClick={addBullet} label="Add bullet" />
    </div>
  );
}
