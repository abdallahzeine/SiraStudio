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
import type { BulletEntry, IconStyle } from '../../../shared/types';
import { CVTextEditor } from '../editor/CVTextEditor';
import { useDndSensors } from '../editor/useDndSensors';
import { useDispatch } from '../../../app/store';
import { ReorderButtons, DeleteButton, AddButton } from './Buttons';
import { uid } from '../../../shared/utils/helpers';

interface BulletListProps {
  bullets: BulletEntry[];
  bulletsPath: string;
  iconStyle: IconStyle;
  bulletPlaceholder?: string;
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
  placeholder,
}: {
  bulletId: string;
  icon: string;
  value: string;
  path: string;
  index: number;
  total: number;
  onMove: (d: -1 | 1) => void;
  onDelete: () => void;
  placeholder: string;
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
        placeholder={placeholder}
        className="flex-1"
      />
    </li>
  );
}

export function BulletList({ bullets, bulletsPath, iconStyle, bulletPlaceholder = 'Bullet point...' }: BulletListProps) {
  const dispatch = useDispatch();
  const icon = iconChar[iconStyle];

  const bulletIds = bullets.map((bullet) => bullet.id);

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

  const addBullet = () => dispatch({ op: 'insert', path: `${bulletsPath}[-1]`, value: { id: uid(), text: 'New bullet point.' } });
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
            {bullets.map((bullet, i) => (
              <SortableBullet
                key={bullet.id}
                bulletId={bullet.id}
                icon={icon}
                value={bullet.text}
                path={`${bulletsPath}[${i}].text`}
                index={i}
                total={bullets.length}
                onMove={(d) => moveBullet(i, d)}
                onDelete={() => deleteBullet(i)}
                placeholder={bulletPlaceholder}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <AddButton onClick={addBullet} label="Add bullet" />
    </div>
  );
}
