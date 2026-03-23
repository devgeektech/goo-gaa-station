import mongoose from 'mongoose';
import slugify from 'slugify';

const CATEGORY_TYPES = ['food', 'grocery', 'pharmacy', 'fashion', 'retail'] as const;

const CategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, unique: true, trim: true },
    icon: { type: String, default: null },
    description: { type: String, default: '' },
    type: { type: String, required: true, enum: CATEGORY_TYPES },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CategorySchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

CategorySchema.index({ slug: 1 });
CategorySchema.index({ type: 1 });
CategorySchema.index({ isActive: 1, isDeleted: 1 });

export const Category =
  mongoose.models.Category ?? mongoose.model('Category', CategorySchema);

export type CategoryType = (typeof CATEGORY_TYPES)[number];
