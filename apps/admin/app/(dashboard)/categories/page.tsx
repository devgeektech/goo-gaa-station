'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LayoutGrid, Plus } from 'lucide-react';
import { useGetCategoriesQuery, useReorderCategoriesMutation } from '@/store/api';
import type { CategoryItem } from '@/store/api';
import { CategoryCard } from '@/components/categories/CategoryCard';
import { AddCategoryModal } from '@/components/categories/AddCategoryModal';
import { EditCategoryDrawer } from '@/components/categories/EditCategoryDrawer';
import { DeleteCategoryDialog } from '@/components/categories/DeleteCategoryDialog';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useTranslations } from '@/lib/i18n/useTranslations';

function SortableCategoryCard({
  category,
  onEdit,
  onDelete,
}: {
  category: CategoryItem;
  onEdit: (c: CategoryItem) => void;
  onDelete: (c: CategoryItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: category._id });
  const style = transform ? { transform: CSS.Transform.toString(transform), transition } : undefined;
  return (
    <div ref={setNodeRef} style={style}>
      <CategoryCard
        category={category}
        onEdit={onEdit}
        onDelete={onDelete}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragging={isDragging}
      />
    </div>
  );
}

export default function CategoriesPage() {
  const t = useTranslations();
  const FILTERS = useMemo(
    () => [
      { value: 'all', label: t.categories.filterAll },
      { value: 'food', label: t.categories.filterFood },
      { value: 'grocery', label: t.categories.filterGrocery },
      { value: 'pharmacy', label: t.categories.filterPharmacy },
      { value: 'fashion', label: t.categories.filterFashion },
    ],
    [t]
  );

  const [filter, setFilter] = useState<string>('all');
  const [localOrder, setLocalOrder] = useState<CategoryItem[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editCategory, setEditCategory] = useState<CategoryItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteCategory, setDeleteCategory] = useState<CategoryItem | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: categories = [], isLoading, isError } = useGetCategoriesQuery();
  const [reorderCategories] = useReorderCategoriesMutation();
  const toast = useToast();

  const displayList = localOrder ?? categories;
  const filtered =
    filter === 'all'
      ? displayList
      : displayList.filter((c) => c.type === filter);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const list = localOrder ?? categories;
      const oldIndex = list.findIndex((c) => c._id === active.id);
      const newIndex = list.findIndex((c) => c._id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      const next = arrayMove(list, oldIndex, newIndex);
      setLocalOrder(next);
      const payload = next.map((c, i) => ({ id: c._id, sortOrder: i }));
      reorderCategories(payload)
        .unwrap()
        .then(() => {
          setLocalOrder(null);
          toast.push({ title: t.categories.reorderSaved, variant: 'success' });
        })
        .catch(() => {
          setLocalOrder(null);
          toast.push({ title: t.categories.reorderFailed, variant: 'danger' });
        });
    },
    [localOrder, categories, reorderCategories, toast, t.categories]
  );

  const handleEdit = (c: CategoryItem) => {
    setEditCategory(c);
    setEditOpen(true);
  };
  const handleDelete = (c: CategoryItem) => {
    setDeleteCategory(c);
    setDeleteOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="row adminPageHeader" style={{ justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>
            {t.categories.title}
          </h1>
          <div className="muted" style={{ marginTop: 4 }}>{t.categories.subtitle}</div>
        </div>
        <button className="btn btnPrimary" onClick={() => setAddOpen(true)} aria-label={t.categories.addNew}>
          <Plus size={18} aria-hidden /> {t.categories.addNew}
        </button>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={filter === f.value ? 'btn btnPrimary' : 'btn'}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="cardBody">
          {isLoading && displayList.length === 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 16,
              }}
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="card" style={{ padding: 16 }}>
                  <div style={{ margin: '0 auto 12px', borderRadius: '50%', overflow: 'hidden', width: 64, height: 64 }}>
                    <Skeleton height={64} width={64} />
                  </div>
                  <div style={{ marginBottom: 8 }}><Skeleton height={16} /></div>
                  <Skeleton height={14} width={80} />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="muted" style={{ color: 'var(--danger)' }}>{t.categories.loadFailed}</div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<LayoutGrid size={48} />}
              heading={t.categories.noCategories}
              subtext={filter === 'all' ? '' : t.common.tryFilters}
              action={
                <button className="btn btnPrimary" onClick={() => setAddOpen(true)}>
                  {t.categories.addNew}
                </button>
              }
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filtered.map((c) => c._id)}>
                <div className="categoriesGrid">
                  {filtered.map((c) => (
                    <SortableCategoryCard
                      key={c._id}
                      category={c}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <AddCategoryModal open={addOpen} onClose={() => setAddOpen(false)} />
      <EditCategoryDrawer category={editCategory} open={editOpen} onClose={() => { setEditOpen(false); setEditCategory(null); }} />
      <DeleteCategoryDialog
        category={deleteCategory}
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setDeleteCategory(null); }}
      />
    </div>
  );
}
