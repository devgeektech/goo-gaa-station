import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { RefreshToken, type UserModelType } from '../models/RefreshToken';

export interface AccessPayload {
  _id: string;
  email?: string;
  phone?: string;
  role: string;
  model: UserModelType;
}


/** Access token payload as in JWT (type discriminator for auth middleware) */
export interface AccessTokenPayload extends AccessPayload {
  type?: 'access';
}

export interface RefreshPayload extends AccessPayload {
  type: 'refresh';
}

function ensureJwtSecrets(): void {
  if (!env.JWT_SECRET?.trim() || !env.JWT_REFRESH_SECRET?.trim()) {
    throw new Error(
      'JWT_SECRET and JWT_REFRESH_SECRET must be set in .env (or .env.development). Add them to your env file and restart the API.'
    );
  }
}

/** JWT access token (short-lived). Use in Authorization: Bearer for protected routes. */
export function generateAccessToken(payload: AccessPayload): string {
  ensureJwtSecrets();
  return jwt.sign(
    { ...payload, type: 'access' as const },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRY } as jwt.SignOptions
  );
}

/** JWT refresh token (long-lived) */
export function generateRefreshToken(payload: AccessPayload): string {
  ensureJwtSecrets();
  return jwt.sign(
    { ...payload, type: 'refresh' as const },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRY } as jwt.SignOptions
  );
}

/** SHA-256 hex of token — never store raw refresh tokens */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Store hashed refresh token in DB with TTL */
export async function storeRefreshToken(
  userId: mongoose.Types.ObjectId,
  userModel: UserModelType,
  rawToken: string
): Promise<void> {
  const decoded = jwt.decode(rawToken) as { exp: number } | null;
  const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await RefreshToken.create({
    userId,
    userModel,
    tokenHash: hashToken(rawToken),
    expiresAt,
  });
}

/** Delete old token by hash, generate new refresh token, store it, return new pair */
export async function rotateRefreshToken(
  oldRawToken: string,
  userId: mongoose.Types.ObjectId,
  userModel: UserModelType,
  payload: AccessPayload
): Promise<{ accessToken: string; refreshToken: string; expiresIn: string }> {
  const hash = hashToken(oldRawToken);
  const doc = await RefreshToken.findOne({ userId, userModel, tokenHash: hash });
  if (!doc) {
    throw new Error('INVALID_REFRESH_TOKEN');
  }
  if (doc.expiresAt < new Date()) {
    await RefreshToken.deleteOne({ _id: doc._id });
    throw new Error('REFRESH_TOKEN_EXPIRED');
  }
  await RefreshToken.deleteOne({ _id: doc._id });

  const accessPayload: AccessPayload = {
    _id: payload._id,
    email: payload.email,
    phone: payload.phone,
    role: payload.role,
    model: payload.model,
  };
  const accessToken = generateAccessToken(accessPayload);
  const refreshToken = generateRefreshToken(accessPayload);
  await storeRefreshToken(userId, userModel, refreshToken);

  const decoded = jwt.decode(accessToken) as { exp: number };
  const expiresIn = decoded?.exp ? `${decoded.exp - Math.floor(Date.now() / 1000)}` : '900';

  return { accessToken, refreshToken, expiresIn };
}

/** Find by hash, check expiry, return payload. Throws if invalid. */
export async function verifyRefreshToken(rawToken: string): Promise<RefreshPayload> {
  const payload = jwt.verify(rawToken, env.JWT_REFRESH_SECRET) as RefreshPayload;
  if (payload.type !== 'refresh') throw new Error('INVALID_REFRESH_TOKEN');

  const hash = hashToken(rawToken);
  const doc = await RefreshToken.findOne({
    userId: payload._id,
    userModel: payload.model,
    tokenHash: hash,
  });
  if (!doc) throw new Error('REFRESH_TOKEN_NOT_FOUND');
  if (doc.expiresAt < new Date()) {
    await RefreshToken.deleteOne({ _id: doc._id });
    throw new Error('REFRESH_TOKEN_EXPIRED');
  }
  return payload;
}


/** Delete refresh token by raw (hash and delete) */
export async function deleteRefreshToken(
  userId: mongoose.Types.ObjectId,
  userModel: UserModelType,
  rawToken: string
): Promise<void> {
  const hash = hashToken(rawToken);
  await RefreshToken.deleteOne({ userId, userModel, tokenHash: hash });
}

/** Invalidate all refresh tokens for a user (e.g. after reset password) */
export async function invalidateAllRefreshTokensForUser(
  userId: mongoose.Types.ObjectId,
  userModel: UserModelType
): Promise<void> {
  await RefreshToken.deleteMany({ userId, userModel });
}
