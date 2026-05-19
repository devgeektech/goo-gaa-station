import path from 'path';
import fs from 'fs';
import multer from 'multer';
import type { StorageEngine } from 'multer';
import crypto from 'crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { AppError } from './AppError';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_MIMES_KYC = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_FILE_SIZE_2MB = 2 * 1024 * 1024; // 2MB for product/category images
export const MAX_FILE_SIZE_5MB = 5 * 1024 * 1024; // 5MB for KYC documents
export const MAX_FILE_SIZE_10MB = 10 * 1024 * 1024; // 10MB for profile and vendor logo/cover images

function getExtension(mimetype: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };
  return map[mimetype] || '.bin';
}

function isS3Provider(): boolean {
  return (env.STORAGE_PROVIDER || 'local').toLowerCase() === 's3';
}

function isS3Configured(): boolean {
  return Boolean(
    env.AWS_BUCKET?.trim() &&
      env.AWS_REGION?.trim() &&
      env.AWS_ACCESS_KEY?.trim() &&
      env.AWS_SECRET_KEY?.trim()
  );
}

function assertS3Ready(): void {
  if (!isS3Configured()) {
    throw new AppError(
      {
        en: 'S3 storage is selected but AWS_BUCKET, AWS_REGION, AWS_ACCESS_KEY, and AWS_SECRET_KEY must all be set',
        de: 'S3 ist aktiv, aber AWS-Umgebungsvariablen fehlen',
      },
      503,
      'STORAGE_MISCONFIGURED'
    );
  }
}

let s3Client: S3Client | null = null;

function getS3(): S3Client {
  if (!s3Client) {
    const endpoint = env.AWS_S3_ENDPOINT?.trim();
    s3Client = new S3Client({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.AWS_ACCESS_KEY,
        secretAccessKey: env.AWS_SECRET_KEY,
      },
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    });
  }
  return s3Client;
}

/** Public HTTPS URL for an object key (virtual-hosted style, or AWS_S3_PUBLIC_BASE_URL for CDN). */
export function buildS3PublicUrl(key: string): string {
  const base = (env.AWS_S3_PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (base) {
    return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
  return `https://${env.AWS_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function objectKeyForFolder(folder: string, mimetype: string): string {
  const ext = getExtension(mimetype);
  const randomHex = crypto.randomBytes(8).toString('hex');
  return `${folder}/${Date.now()}-${randomHex}${ext}`;
}

function createS3Storage(folder: string): StorageEngine {
  return {
    _handleFile(_req, file, cb) {
      const key = objectKeyForFolder(folder, file.mimetype);
      const chunks: Buffer[] = [];
      file.stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      file.stream.on('error', (err) => cb(err));
      file.stream.on('end', () => {
        void (async () => {
          try {
            const Body = Buffer.concat(chunks);
            await getS3().send(
              new PutObjectCommand({
                Bucket: env.AWS_BUCKET,
                Key: key,
                Body,
                ContentType: file.mimetype,
                CacheControl: 'public, max-age=31536000',
              })
            );
            const location = buildS3PublicUrl(key);
            const basename = path.basename(key);
            cb(null, {
              fieldname: file.fieldname,
              originalname: file.originalname,
              encoding: file.encoding,
              mimetype: file.mimetype,
              size: Body.length,
              destination: folder,
              filename: basename,
              path: location,
              buffer: undefined,
              location,
              key,
            } as unknown as Express.Multer.File);
          } catch (err) {
            cb(err instanceof Error ? err : new Error(String(err)));
          }
        })();
      });
    },
    _removeFile(_req, file, cb) {
      cb(null);
    },
  };
}

function createDiskStorage(folder: string): multer.StorageEngine {
  const uploadPath = path.join(process.cwd(), env.UPLOAD_DIR, folder);
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadPath),
    filename: (_req, file, cb) => {
      const ext = getExtension(file.mimetype);
      const randomHex = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}-${randomHex}${ext}`);
    },
  });
}

/**
 * Returns configured multer instance for uploads.
 * LOCAL: diskStorage to uploads/{folder}/, jpeg|png|webp only.
 * S3: memory stream → PutObject; stored URL returned via getFileUrl(file, folder).
 */
export function getUploadMiddleware(folder: string, maxSize: number = MAX_FILE_SIZE): multer.Multer {
  const useS3 = isS3Provider();
  if (useS3) assertS3Ready();

  const storage = useS3 ? createS3Storage(folder) : createDiskStorage(folder);

  const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          { en: 'Only jpeg, png, webp allowed', de: 'Nur jpeg, png, webp erlaubt' },
          415,
          'UNSUPPORTED_MEDIA'
        ) as unknown as Error
      );
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxSize },
  });
}

export type KycUploadOptions = {
  /** Defaults to jpeg, png, webp, pdf */
  allowedMimes?: readonly string[];
};

/** Multer for KYC docs: images + pdf, configurable max size. */
export function getUploadMiddlewareKyc(
  folder: string,
  maxSize: number = MAX_FILE_SIZE,
  options?: KycUploadOptions
): multer.Multer {
  const useS3 = isS3Provider();
  if (useS3) assertS3Ready();

  const allowed = options?.allowedMimes ?? ALLOWED_MIMES_KYC;
  const storage = useS3 ? createS3Storage(folder) : createDiskStorage(folder);

  const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          { en: 'File type not allowed for this upload', de: 'Dateityp nicht erlaubt' },
          415,
          'UNSUPPORTED_MEDIA'
        ) as unknown as Error
      );
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxSize },
  });
}

function extractS3KeyFromUrl(fileUrl: string): string | null {
  try {
    const u = new URL(fileUrl);
    let pathname = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
    pathname = decodeURIComponent(pathname);
    if (!pathname) return null;
    const segments = pathname.split('/');
    if (segments[0] === env.AWS_BUCKET) {
      return segments.slice(1).join('/');
    }
    return pathname;
  } catch {
    return null;
  }
}

async function deleteS3ObjectByUrl(fileUrl: string): Promise<void> {
  if (!isS3Configured()) return;
  const key = extractS3KeyFromUrl(fileUrl);
  if (!key) return;
  try {
    await getS3().send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET, Key: key }));
  } catch {
    // best-effort delete
  }
}

/** Delete local file under project root, or delete S3 object when URL is https and S3 is configured. */
export function deleteLocalFile(filePath: string): void {
  if (!filePath) return;
  if (/^https?:\/\//i.test(filePath)) {
    void deleteS3ObjectByUrl(filePath);
    return;
  }
  const normalized = filePath.startsWith('/') ? filePath.slice(1) : filePath;
  const fullPath = path.join(process.cwd(), normalized);
  try {
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch {
    // ignore
  }
}

type MulterFileWithLocation = Express.Multer.File & { location?: string; key?: string };

/** Public URL for an uploaded file. Local: /uploads/folder/filename. S3: HTTPS URL on file.location. */
export function getFileUrl(file: Express.Multer.File | undefined, folder: string): string {
  if (!file) return '';
  const f = file as MulterFileWithLocation;
  if (isS3Provider() && f.location) {
    return f.location;
  }
  if (!file.filename) return '';
  return `/uploads/${folder}/${file.filename}`;
}
