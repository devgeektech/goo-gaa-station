/**
 * FCM (Firebase Cloud Messaging) service.
 * Initialize firebase-admin from FIREBASE_SERVICE_ACCOUNT (path to JSON or JSON string).
 * sendToDevice / sendToMultiple; check notificationPrefs for customers; remove invalid tokens.
 */

import path from 'path';
import fs from 'fs';
import { env } from '../config/env';
import { User } from '../models/User';
import { Driver } from '../models/Driver';
import { Vendor } from '../models/Vendor';

let firebaseAdmin: typeof import('firebase-admin') | null = null;

function getFirebaseAdmin(): typeof import('firebase-admin') | null {
  if (firebaseAdmin) return firebaseAdmin;
  const raw = env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  try {
    const admin = require('firebase-admin') as typeof import('firebase-admin');
    if (admin.apps?.length) {
      firebaseAdmin = admin;
      return admin;
    }
    let cred: object;
    if (raw.startsWith('{')) {
      cred = JSON.parse(raw) as object;
    } else {
      const keyPath = path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
      const keyContent = fs.readFileSync(keyPath, 'utf8');
      cred = JSON.parse(keyContent) as object;
    }
    admin.initializeApp({ credential: admin.credential.cert(cred as import('firebase-admin').ServiceAccount) });
    firebaseAdmin = admin;
    return admin;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[FCM] Firebase init failed:', (err as Error).message);
    }
    return null;
  }
}

export interface FcmNotification {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface SendResult {
  success: number;
  failed: number;
  invalidTokens: string[];
}

/** Send to a single device. Returns invalidToken: true if token is invalid/expired. */
export async function sendToDevice(
  token: string,
  notification: FcmNotification
): Promise<{ success: boolean; invalidToken?: boolean }> {
  const admin = getFirebaseAdmin();
  if (!admin) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[FCM] stub sendToDevice:', notification.title);
    }
    return { success: true };
  }
  try {
    await admin.messaging().send({
      token,
      notification: { title: notification.title, body: notification.body },
      data: notification.data ?? {},
      android: { priority: 'high' as const },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    return { success: true };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? '';
    const invalid = /invalid|not-found|unregistered|invalid-registration/i.test(code);
    if (invalid) return { success: false, invalidToken: true };
    throw err;
  }
}

/** Send to multiple devices. Returns invalidTokens list for removal from DB. */
export async function sendToMultiple(
  tokens: string[],
  notification: FcmNotification
): Promise<SendResult> {
  if (tokens.length === 0) return { success: 0, failed: 0, invalidTokens: [] };

  const admin = getFirebaseAdmin();
  if (!admin) {
    if (process.env.NODE_ENV === 'development') {
      console.log('[FCM] stub sendToMultiple:', notification.title, '→', tokens.length, 'tokens');
    }
    return { success: tokens.length, failed: 0, invalidTokens: [] };
  }

  const message = {
    notification: { title: notification.title, body: notification.body },
    data: notification.data ?? {},
    tokens,
    android: { priority: 'high' as const },
    apns: { payload: { aps: { sound: 'default' } } },
  };

  const invalidCodes = ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered', 'messaging/invalid-argument'];
  const invalidTokens: string[] = [];

  try {
    const res = await admin.messaging().sendEachForMulticast(message);
    res.responses.forEach((r, i) => {
      if (!r.success && r.error?.code && invalidCodes.some((c) => String(r.error?.code).includes(c))) {
        invalidTokens.push(tokens[i]!);
      }
    });
    return {
      success: res.successCount,
      failed: res.failureCount,
      invalidTokens,
    };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') console.warn('[FCM] sendEachForMulticast error:', err);
    return { success: 0, failed: tokens.length, invalidTokens: [] };
  }
}

/** Remove invalid FCM tokens from User document. */
export async function removeInvalidTokensFromUser(userId: string, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const user = await User.findById(userId).select('fcmToken fcmTokens').lean() as UserWithTokens | null;
  if (!user) return;
  const set = new Set(tokens);
  const legacyMatch = user.fcmToken && set.has(user.fcmToken);
  const filtered = (user.fcmTokens ?? []).filter((t: { token: string }) => !set.has(t.token));
  const update: { fcmToken?: null; fcmTokens?: typeof filtered } = { fcmTokens: filtered };
  if (legacyMatch) update.fcmToken = null;
  await User.findByIdAndUpdate(userId, update);
}

/** Remove invalid FCM tokens from Driver document. */
export async function removeInvalidTokensFromDriver(driverId: string, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const driver = await Driver.findById(driverId).select('fcmToken fcmTokens').lean() as DriverWithTokens | null;
  if (!driver) return;
  const set = new Set(tokens);
  const legacyMatch = driver.fcmToken && set.has(driver.fcmToken);
  const filtered = (driver.fcmTokens ?? []).filter((t: { token: string }) => !set.has(t.token));
  const update: { fcmToken?: null; fcmTokens?: typeof filtered } = { fcmTokens: filtered };
  if (legacyMatch) update.fcmToken = null;
  await Driver.findByIdAndUpdate(driverId, update);
}

/** Remove invalid FCM tokens from Vendor document. */
export async function removeInvalidTokensFromVendor(vendorId: string, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const vendor = await Vendor.findById(vendorId).select('fcmTokens').lean() as VendorWithTokens | null;
  if (!vendor) return;
  const set = new Set(tokens);
  const filtered = (vendor.fcmTokens ?? []).filter((t: { token: string }) => !set.has(t.token));
  await Vendor.findByIdAndUpdate(vendorId, { fcmTokens: filtered });
}

// --- Legacy helpers (DriverWithTokens / UserWithTokens) ---

export type DriverWithTokens = {
  _id?: unknown;
  fcmToken?: string | null;
  fcmTokens?: Array<{ token: string }>;
};

export type VendorWithTokens = {
  _id?: unknown;
  fcmTokens?: Array<{ token: string }>;
};

export type UserWithTokens = {
  _id?: unknown;
  fcmToken?: string | null;
  fcmTokens?: Array<{ token: string }>;
  notificationPrefs?: { push?: boolean };
};

export function getDriverFcmTokens(driver: DriverWithTokens): string[] {
  const set = new Set<string>();
  if (driver.fcmToken?.trim()) set.add(driver.fcmToken.trim());
  for (const t of driver.fcmTokens ?? []) {
    if (t?.token?.trim()) set.add(t.token.trim());
  }
  return Array.from(set);
}

export function getVendorFcmTokens(vendor: VendorWithTokens): string[] {
  const set = new Set<string>();
  for (const t of vendor.fcmTokens ?? []) {
    if (t?.token?.trim()) set.add(t.token.trim());
  }
  return Array.from(set);
}

export function getCustomerFcmTokens(user: UserWithTokens): string[] {
  const set = new Set<string>();
  if (user.fcmToken?.trim()) set.add(user.fcmToken.trim());
  for (const t of user.fcmTokens ?? []) {
    if (t?.token?.trim()) set.add(t.token.trim());
  }
  return Array.from(set);
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Send push to tokens (used by order status etc.). Returns invalidTokens for caller to remove if needed. */
export async function sendPushToTokens(
  tokens: string[],
  payload: PushPayload
): Promise<{ success: number; failed: number; invalidTokens: string[] }> {
  const res = await sendToMultiple(tokens, payload);
  return {
    success: res.success,
    failed: res.failed,
    invalidTokens: res.invalidTokens,
  };
}

/** Send push to customer; checks notificationPrefs.push; removes invalid tokens from User. */
export async function sendPushToCustomer(
  user: UserWithTokens & { _id?: unknown },
  payload: PushPayload
): Promise<{ success: number; failed: number }> {
  const prefs = user.notificationPrefs;
  if (prefs && prefs.push === false) return { success: 0, failed: 0 };
  const tokens = getCustomerFcmTokens(user);
  const res = await sendToMultiple(tokens, payload);
  const id = user._id?.toString?.();
  if (id && res.invalidTokens.length) await removeInvalidTokensFromUser(id, res.invalidTokens);
  return { success: res.success, failed: res.failed };
}

/** Send push to driver; removes invalid tokens from Driver. */
export async function sendPushToDriver(
  driver: DriverWithTokens,
  payload: PushPayload
): Promise<{ success: number; failed: number }> {
  const tokens = getDriverFcmTokens(driver);
  const res = await sendToMultiple(tokens, payload);
  const id = driver._id?.toString?.();
  if (id && res.invalidTokens.length) await removeInvalidTokensFromDriver(id, res.invalidTokens);
  return { success: res.success, failed: res.failed };
}

/** Send push to vendor; removes invalid tokens from Vendor. */
export async function sendPushToVendor(
  vendor: VendorWithTokens,
  payload: PushPayload
): Promise<{ success: number; failed: number }> {
  const tokens = getVendorFcmTokens(vendor);
  const res = await sendToMultiple(tokens, payload);
  const id = vendor._id?.toString?.();
  if (id && res.invalidTokens.length) await removeInvalidTokensFromVendor(id, res.invalidTokens);
  return { success: res.success, failed: res.failed };
}
