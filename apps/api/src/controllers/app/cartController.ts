import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import { Cart } from '../../models/Cart';
import { Product } from '../../models/Product';
import { Vendor } from '../../models/Vendor';
import { AppSettings } from '../../models/AppSettings';
import { AppError } from '../../utils/AppError';
import { sendSuccess } from '../../utils/response';
import { asyncHandler } from '../../utils/asyncHandler';

/** GET / — Get cart for current customer; populate items.product */
export const getCart = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const customerIdObj = new mongoose.Types.ObjectId(customerId);
  const [cart, settings] = await Promise.all([
    (Cart as any).findOne({ customer: customerIdObj }).populate('items.product', '_id name price image isAvailable').lean(),
    (AppSettings as any).findOne().select('deliveryFee taxPercent').lean(),
  ]);

  const deliveryFee = Number((settings as { deliveryFee?: number })?.deliveryFee ?? 0) || 0;
  const taxPercent = Number((settings as { taxPercent?: number })?.taxPercent ?? 0) || 0;

  const subtotal = cart ? Number((cart as { subtotal?: number }).subtotal ?? 0) || 0 : 0;
  const taxAmount = Math.max(0, subtotal * (taxPercent / 100));
  const grandTotal = subtotal + deliveryFee + taxAmount;

  if (!cart) {
    return sendSuccess(res, { cart: null, subtotal, deliveryFee, taxPercent, taxAmount, grandTotal });
  }

  return sendSuccess(res, {
    ...cart,
    deliveryFee,
    taxPercent,
    taxAmount,
    grandTotal,
  });
});

/** POST / — Set cart: vendorId, items [{ productId, qty }]; validate vendor + products, upsert cart */
export const setCart = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const body = req.body ?? {};
  const vendorId = body.vendorId;
  const items = body.items;

  if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
    throw new AppError({ en: 'Valid vendorId is required', de: 'Vendor erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  if (!items || !Array.isArray(items)) {
    throw new AppError({ en: 'items array is required', de: 'Artikel-Array erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const vendorIdObj = new mongoose.Types.ObjectId(vendorId);
  const vendor = await (Vendor as any).findById(vendorIdObj).select('status').lean();
  if (!vendor || (vendor as { status?: string }).status !== 'active') {
    throw new AppError({ en: 'Vendor not found or not active', de: 'Anbieter nicht gefunden oder inaktiv' }, 404, 'NOT_FOUND');
  }

  const productIds = (items as Array<{ productId?: string }>)
    .map((i) => i?.productId)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id as string));
  const products = await (Product as any).find({
    _id: { $in: productIds },
    vendor: vendorIdObj,
    isDeleted: false,
  }).lean();

  const productMap = new Map(
    products.map((p: { _id: mongoose.Types.ObjectId }) => [p._id.toString(), p] as const)
  );

  const cartItems: Array<{ product: mongoose.Types.ObjectId; name: string; price: number; qty: number; image: string | null }> = [];
  for (const item of items as Array<{ productId?: string; qty?: number }>) {
    const pid = item?.productId ? String(item.productId) : null;
    const qty = Math.floor(Number(item?.qty) || 0);
    if (qty < 1) {
      throw new AppError({ en: 'Each item must have qty >= 1', de: 'Menge mindestens 1' }, 422, 'VALIDATION_ERROR');
    }
    const product = pid ? productMap.get(pid) : null;
    if (!product) {
      throw new AppError(
        { en: `Product not found or wrong vendor: ${pid || 'missing productId'}`, de: 'Produkt nicht gefunden oder falscher Anbieter' },
        422,
        'VALIDATION_ERROR'
      );
    }
    const p = product as { _id: mongoose.Types.ObjectId; name: string; price: number; image?: string | null; isAvailable?: boolean };
    if (p.isAvailable === false) {
      throw new AppError(
        { en: `Product not available: ${p.name}`, de: `Nicht verfügbar: ${p.name}` },
        422,
        'VALIDATION_ERROR'
      );
    }
    cartItems.push({
      product: p._id,
      name: p.name,
      price: p.price,
      qty,
      image: p.image ?? null,
    });
  }

  const customerIdObj = new mongoose.Types.ObjectId(customerId);

  // SINGLE-VENDOR ENFORCEMENT:
  // If a cart already exists and belongs to another vendor, block switching vendors.
  const existing = await (Cart as any).findOne({ customer: customerIdObj }).select('vendor').lean();
  if (existing?.vendor && String((existing as { vendor: mongoose.Types.ObjectId }).vendor) !== String(vendorIdObj)) {
    const existingVendor = await (Vendor as any)
      .findById((existing as { vendor: mongoose.Types.ObjectId }).vendor)
      .select('name')
      .lean();
    const existingName = (existingVendor as { name?: string })?.name ?? 'another restaurant';
    throw new AppError(
      {
        en: `Your cart already contains items from ${existingName}. Clear your cart to add items from this restaurant.`,
        de: `Ihr Warenkorb enthält bereits Artikel von ${existingName}. Leeren Sie den Warenkorb, um Artikel dieses Anbieters hinzuzufügen.`,
      },
      409,
      'VENDOR_CONFLICT'
    );
  }

  // Merge into existing cart (same vendor) so caller can send multiple items
  // and subsequent calls can append items instead of overwriting.
  const cartDoc = await (Cart as any).findOne({ customer: customerIdObj });
  const cartToSave = cartDoc ?? new (Cart as any)({ customer: customerIdObj, vendor: vendorIdObj, items: [], subtotal: 0 });

  (cartToSave as any).vendor = vendorIdObj;
  const existingItems = ((cartToSave as any).items ?? []) as Array<{
    product: mongoose.Types.ObjectId;
    name: string;
    price: number;
    qty: number;
    image: string | null;
  }>;

  for (const incoming of cartItems) {
    const idx = existingItems.findIndex((x) => x.product.toString() === incoming.product.toString());
    if (idx >= 0) existingItems[idx].qty += incoming.qty;
    else existingItems.push(incoming);
  }

  (cartToSave as any).items = existingItems;
  (cartToSave as any).subtotal = existingItems.reduce((s, i) => s + i.price * i.qty, 0);
  (cartToSave as any).updatedAt = new Date();
  await (cartToSave as any).save();

  const cart = await (Cart as any).findOne({ customer: customerIdObj })
    .populate('items.product', '_id name price image isAvailable')
    .lean();

  return sendSuccess(res, cart);
});

/** PATCH /item — Update one item by productId; body: { productId, qty }. qty 0 removes item; empty cart deletes doc */
export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  const body = req.body ?? {};
  const productId = body.productId;
  const qty = body.qty != null ? Math.max(0, Math.floor(Number(body.qty))) : null;

  if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
    throw new AppError({ en: 'Valid productId is required', de: 'productId erforderlich' }, 400, 'VALIDATION_ERROR');
  }
  if (qty === null) {
    throw new AppError({ en: 'qty is required', de: 'Menge erforderlich' }, 400, 'VALIDATION_ERROR');
  }

  const customerIdObj = new mongoose.Types.ObjectId(customerId);
  const productIdObj = new mongoose.Types.ObjectId(productId);

  const cart = await (Cart as any).findOne({ customer: customerIdObj });
  if (!cart) {
    throw new AppError({ en: 'Cart not found', de: 'Warenkorb nicht gefunden' }, 404, 'NOT_FOUND');
  }

  const items = (cart as { items: Array<{ product: mongoose.Types.ObjectId; name: string; price: number; qty: number; image: string | null }> }).items;
  const idx = items.findIndex((i) => i.product.toString() === productId);
  if (idx === -1) {
    throw new AppError({ en: 'Product not in cart', de: 'Produkt nicht im Warenkorb' }, 404, 'NOT_FOUND');
  }

  if (qty === 0) {
    items.splice(idx, 1);
  } else {
    items[idx].qty = qty;
  }

  if (items.length === 0) {
    await (Cart as any).deleteOne({ customer: customerIdObj });
    return sendSuccess(res, null);
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  (cart as { subtotal: number }).subtotal = subtotal;
  (cart as { updatedAt: Date }).updatedAt = new Date();
  await cart.save();

  const updated = await (Cart as any).findOne({ customer: customerIdObj })
    .populate('items.product', '_id name price image isAvailable')
    .lean();
  return sendSuccess(res, updated);
});

/** DELETE / — Clear cart */
export const clearCart = asyncHandler(async (req: Request, res: Response) => {
  const customerId = req.user?._id;
  if (!customerId) throw new AppError({ en: 'Unauthorized', de: 'Nicht autorisiert' }, 401, 'UNAUTHORIZED');

  await Cart.deleteOne({ customer: new mongoose.Types.ObjectId(customerId) });
  return res.status(200).json({ message: 'Cart cleared' });
});
