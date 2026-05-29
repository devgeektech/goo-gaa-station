import mongoose from 'mongoose';
import type { Server as SocketIOServer } from 'socket.io';
import { Vendor } from '../models/Vendor';
import { Product } from '../models/Product';
import { MenuItem } from '../models/MenuItem';
import { Cart } from '../models/Cart';
import { Rating } from '../models/Rating';
import { Order } from '../models/Order';
import { User } from '../models/User';
import { AppError } from '../utils/AppError';
import { deleteLocalFile } from '../utils/storageProvider';
import { invalidateAllRefreshTokensForUser } from './auth.service';

/** Order statuses where the vendor still has an open obligation. */
const ACTIVE_VENDOR_ORDER_STATUSES = [
  'pending',
  'vendor_notified',
  'placed',
  'accepted',
  'confirmed',
  'preparing',
  'ready',
  'picked_up',
  'on_the_way',
] as const;

function pushUrl(urls: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.trim()) urls.add(value.trim());
}

function collectVendorDocumentUrls(vendor: Record<string, unknown>): Set<string> {
  const urls = new Set<string>();
  pushUrl(urls, vendor.logo);
  pushUrl(urls, vendor.coverImage);

  const kyc = vendor.kycDocuments as Record<string, unknown> | undefined;
  if (kyc) {
    pushUrl(urls, kyc.businessRegistration);
    pushUrl(urls, kyc.healthSafetyLicense);
    const identity = kyc.identityDocument;
    if (Array.isArray(identity)) {
      for (const u of identity) pushUrl(urls, u);
    }
  }
  return urls;
}

async function collectRelatedMediaUrls(vendorId: mongoose.Types.ObjectId): Promise<Set<string>> {
  const urls = new Set<string>();
  const [products, menuItems] = await Promise.all([
    Product.find({ vendor: vendorId }).select('image').lean(),
    MenuItem.find({ vendorId }).select('image').lean(),
  ]);
  for (const row of products) pushUrl(urls, (row as { image?: string }).image);
  for (const row of menuItems) pushUrl(urls, (row as { image?: string }).image);
  return urls;
}

function deleteMediaUrls(urls: Iterable<string>): void {
  for (const url of urls) {
    deleteLocalFile(url);
  }
}

async function assertNoActiveVendorOrders(vendorId: mongoose.Types.ObjectId): Promise<void> {
  const activeOrder = await Order.findOne({
    vendorId,
    status: { $in: [...ACTIVE_VENDOR_ORDER_STATUSES] },
  })
    .select('_id orderNumber status')
    .lean();

  if (activeOrder) {
    throw new AppError(
      {
        en: 'Cannot delete vendor with active orders. Complete or cancel open orders first.',
        de: 'Anbieter mit offenen Bestellungen kann nicht gelöscht werden. Schließen oder stornieren Sie zuerst offene Bestellungen.',
      },
      400,
      'VENDOR_HAS_ACTIVE_ORDER'
    );
  }
}

/** Remove vendor-owned rows and sessions before the Vendor document is deleted. */
export async function purgeVendorBeforeDelete(
  vendorId: mongoose.Types.ObjectId,
  vendorDoc?: Record<string, unknown> | null
): Promise<void> {
  await invalidateAllRefreshTokensForUser(vendorId, 'Vendor');

  const vendor =
    vendorDoc ??
    ((await Vendor.findById(vendorId).lean()) as Record<string, unknown> | null);
  const mediaUrls = vendor ? collectVendorDocumentUrls(vendor) : new Set<string>();
  const relatedUrls = await collectRelatedMediaUrls(vendorId);
  for (const u of relatedUrls) mediaUrls.add(u);

  await Promise.all([
    Product.deleteMany({ vendor: vendorId }),
    MenuItem.deleteMany({ vendorId }),
    Cart.deleteMany({ vendor: vendorId }),
    Rating.deleteMany({ vendorId }),
    User.updateMany({ wishlistVendorIds: vendorId }, { $pull: { wishlistVendorIds: vendorId } }),
  ]);

  deleteMediaUrls(mediaUrls);
}

/**
 * Permanently remove a vendor from the database (admin delete).
 * Historical orders keep vendorId for audit; populate may not resolve.
 */
export async function permanentlyDeleteVendor(
  vendorId: mongoose.Types.ObjectId,
  io?: SocketIOServer
): Promise<Record<string, unknown>> {
  const vendor = (await Vendor.findById(vendorId).lean()) as Record<string, unknown> | null;
  if (!vendor) {
    throw new AppError({ en: 'Vendor not found', de: 'Anbieter nicht gefunden' }, 404, 'NOT_FOUND');
  }

  await assertNoActiveVendorOrders(vendorId);
  await purgeVendorBeforeDelete(vendorId, vendor);

  if (io) {
    io.to(`vendor:${vendorId.toString()}`).emit('vendor:deleted', { vendorId: vendorId.toString() });
  }

  await Vendor.deleteOne({ _id: vendorId });

  return vendor;
}

/** Remove a legacy soft-deleted row so the same phone can register as a new vendor. */
export async function permanentlyDeleteLegacySoftDeletedVendor(
  vendorId: mongoose.Types.ObjectId
): Promise<void> {
  const vendor = await Vendor.findById(vendorId).select('status').lean();
  if (!vendor || (vendor as { status?: string }).status !== 'deleted') return;

  await assertNoActiveVendorOrders(vendorId);
  await purgeVendorBeforeDelete(vendorId);
  await Vendor.deleteOne({ _id: vendorId });
}
