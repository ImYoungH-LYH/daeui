import { DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Power, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from './ui';

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  render,
}: {
  items: T[];
  onReorder: (items: T[]) => void;
  render: (item: T, index: number) => ReactNode;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5">{items.map((it, i) => render(it, i))}</div>
      </SortableContext>
    </DndContext>
  );
}

/** One row in a list page: drag handle, icon, title with badges, summary line and the toggle/edit/delete actions. */
export function ItemCard({
  id,
  icon,
  title,
  badges,
  subtitle,
  right,
  disabled,
  locked,
  sortable = true,
  onToggle,
  onEdit,
  onDelete,
}: {
  id: string;
  icon?: ReactNode;
  title: ReactNode;
  badges?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  disabled?: boolean;
  /** Built-in rows cannot be deleted or toggled. */
  locked?: boolean;
  sortable?: boolean;
  onToggle?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !sortable });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx('card group flex min-h-[60px] items-center gap-2.5 py-2 pl-3 pr-2 sm:pl-4', isDragging && 'relative z-10 shadow-pop', disabled && 'opacity-60')}
    >
      {sortable ? (
        <button className="cursor-grab touch-none text-ink/30 hover:text-ink/60 active:cursor-grabbing" aria-label="拖动排序" {...attributes} {...listeners}>
          <GripVertical size={16} />
        </button>
      ) : (
        <span className="w-4" />
      )}
      {icon && <div className="hidden h-6 w-6 shrink-0 items-center justify-center sm:flex">{icon}</div>}
      <button className="min-w-0 flex-1 text-left" onClick={onEdit} disabled={!onEdit}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cx('truncate text-base leading-6', disabled && 'line-through decoration-ink/40')}>{title}</span>
          {badges}
        </div>
        {subtitle && <div className="truncate text-xs leading-5 text-ink/70">{subtitle}</div>}
        {right && <div className="mt-1.5 sm:hidden">{right}</div>}
      </button>
      {right && <div className="hidden sm:block">{right}</div>}
      <div className="flex shrink-0 items-center">
        {onToggle && (
          <button className={cx('icon-btn', !disabled && 'text-[rgb(34,160,90)] hover:text-[rgb(34,160,90)]')} onClick={onToggle} disabled={locked} title={disabled ? '启用' : '停用'} aria-label={disabled ? '启用' : '停用'}>
            <Power size={16} />
          </button>
        )}
        {onEdit && (
          <button className="icon-btn" onClick={onEdit} title="编辑" aria-label="编辑">
            <Pencil size={16} />
          </button>
        )}
        {onDelete && (
          <button className="icon-btn hover:text-danger" onClick={onDelete} disabled={locked} title="删除" aria-label="删除">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
