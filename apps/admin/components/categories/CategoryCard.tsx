'use client';

import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import { useToggleCategoryActiveMutation } from '@/store/api';
import { useTranslations } from '@/lib/i18n/useTranslations';
import { translations } from '@/lib/i18n/translations';
import type { CategoryItem } from '@/store/api';

const CAT_LABELS = { toggleOn: 'Active', toggleOff: 'Inactive' };
import { Switch } from '@/components/ui/Switch';

const IMG_BASE = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL ?? '') : '';

const TYPE_STYLES: Record<string, { bg: string; text: string }> = {
  food: { bg: 'rgba(234, 88, 12, 0.15)', text: 'rgb(194, 65, 12)' },
  grocery: { bg: 'rgba(22, 163, 74, 0.15)', text: 'rgb(22, 128, 57)' },
  pharmacy: { bg: 'rgba(59, 130, 246, 0.15)', text: 'rgb(37, 99, 235)' },
  fashion: { bg: 'rgba(168, 85, 247, 0.15)', text: 'rgb(126, 34, 206)' },
};

const FALLBACK_LETTER: Record<string, string> = {
  food: 'F',
  grocery: 'G',
  pharmacy: 'P',
  fashion: 'A',
};

type Props = {
  category: CategoryItem;
  onEdit: (c: CategoryItem) => void;
  onDelete: (c: CategoryItem) => void;
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
};

export function CategoryCard({ category, onEdit, onDelete, dragHandleProps, isDragging }: Props) {
  const [toggleActive, { isLoading: toggling }] = useToggleCategoryActiveMutation();
  const t = useTranslations();
  const cat = t?.categories ?? translations?.en?.categories ?? CAT_LABELS;
  const style = TYPE_STYLES[category.type] ?? TYPE_STYLES.food;
  const letter = FALLBACK_LETTER[category.type] ?? '?';
  const iconUrl = category.icon ? (category.icon.startsWith('http') ? category.icon : `${IMG_BASE}${category.icon}`) : null;

  return (
    <div
      className="card"
      style={{
        opacity: isDragging ? 0.6 : 1,
        position: 'relative',
        padding: 16,
      }}
    >
      <div style={{ position: 'absolute', top: 12, left: 12 }} {...dragHandleProps}>
        <button type="button" className="btn" style={{ padding: 6 }} aria-label="Drag to reorder">
          <GripVertical size={18} aria-hidden />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            overflow: 'hidden',
            background: style.bg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {iconUrl ? (
            <img src={iconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 24, fontWeight: 800, color: style.text }}>{letter}</span>
          )}
        </div>
        <div style={{ fontWeight: 600, textAlign: 'center' }}>{category.name}</div>
        <span
          className="badge"
          style={{
            backgroundColor: style.bg,
            color: style.text,
          }}
        >
          {category.type}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {toggling ? (
            <span className="muted" style={{ fontSize: 12 }}>Updating…</span>
          ) : (
            <Switch
              checked={category.isActive}
              onChange={() => toggleActive(category._id)}
              aria-label={category.isActive ? 'Active' : 'Inactive'}
            />
          )}
          <span className="muted" style={{ fontSize: 12 }}>{category.isActive ? cat.toggleOn : cat.toggleOff}</span>
        </div>
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          <button type="button" className="btn" onClick={() => onEdit(category)} aria-label="Edit category">
            <Pencil size={16} aria-hidden />
          </button>
          <button type="button" className="btn btnDanger" onClick={() => onDelete(category)} aria-label="Delete category">
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
