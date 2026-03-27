import mongoose from 'mongoose';
import { User } from '../models/User';

function norm(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Mark one saved address subdocument as default; clears others. No-op if id missing or not found. */
export async function markAddressAsPreferredForCustomer(customerId: string, addressSubdocId: string): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(customerId) || !mongoose.Types.ObjectId.isValid(addressSubdocId)) return;
  const user = await User.findById(customerId);
  if (!user?.addresses?.length) return;
  const addr = user.addresses.id(addressSubdocId);
  if (!addr) return;
  for (const a of user.addresses) {
    (a as { isDefault: boolean }).isDefault = a === addr;
  }
  await user.save();
}

export type OrderDeliveryAddressInput = {
  _id?: string;
  addressId?: string;
  street?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  country?: string;
  lat?: number | null;
  lng?: number | null;
};

function savedAddressMatchesOrder(
  saved: {
    addressLine1?: string;
    addressLine2?: string | null;
    city?: string;
    country?: string;
    lat?: number | null;
    lng?: number | null;
  },
  orderStreet: string,
  orderCity: string,
  orderCountry: string,
  orderLat?: number | null,
  orderLng?: number | null
): boolean {
  if (norm(saved.city || '') !== norm(orderCity) || norm(saved.country || '') !== norm(orderCountry)) return false;

  const line1 = norm(saved.addressLine1 || '');
  const line2 = saved.addressLine2 ? norm(saved.addressLine2) : '';
  const userCombined = line2 && line1 ? `${line1}, ${line2}` : line1;
  const ost = norm(orderStreet);
  if (userCombined && ost) {
    if (ost === userCombined || ost.includes(line1) || userCombined.includes(ost)) return true;
  }

  if (
    orderLat != null &&
    orderLng != null &&
    Number.isFinite(Number(orderLat)) &&
    Number.isFinite(Number(orderLng)) &&
    saved.lat != null &&
    saved.lng != null &&
    Number.isFinite(Number(saved.lat)) &&
    Number.isFinite(Number(saved.lng))
  ) {
    const dLat = Math.abs(Number(orderLat) - Number(saved.lat));
    const dLng = Math.abs(Number(orderLng) - Number(saved.lng));
    if (dLat < 0.0001 && dLng < 0.0001) return true;
  }
  return false;
}

/**
 * After placing an order: if delivery matches a saved address (by _id / addressId, or city+country+line/latlng), set it preferred.
 */
export async function syncPreferredAddressFromOrderDelivery(
  customerId: string,
  deliveryAddress: OrderDeliveryAddressInput
): Promise<void> {
  if (!mongoose.Types.ObjectId.isValid(customerId)) return;

  const idRaw = deliveryAddress._id || deliveryAddress.addressId;
  if (idRaw && mongoose.Types.ObjectId.isValid(String(idRaw))) {
    await markAddressAsPreferredForCustomer(customerId, String(idRaw));
    return;
  }

  const orderStreet =
    (deliveryAddress.street && String(deliveryAddress.street).trim()) ||
    [deliveryAddress.addressLine1, deliveryAddress.addressLine2].filter(Boolean).join(', ').trim();
  const city = deliveryAddress.city ? String(deliveryAddress.city) : '';
  const country = deliveryAddress.country ? String(deliveryAddress.country) : '';
  if (!orderStreet || !city || !country) return;

  const user = await User.findById(customerId).select('addresses');
  if (!user?.addresses?.length) return;

  for (const a of user.addresses) {
    const sub = a as {
      _id?: mongoose.Types.ObjectId;
      addressLine1?: string;
      addressLine2?: string | null;
      city?: string;
      country?: string;
      lat?: number | null;
      lng?: number | null;
    };
    const sid = sub._id?.toString();
    if (
      sid &&
      savedAddressMatchesOrder(sub, orderStreet, city, country, deliveryAddress.lat ?? null, deliveryAddress.lng ?? null)
    ) {
      await markAddressAsPreferredForCustomer(customerId, sid);
      return;
    }
  }
}
