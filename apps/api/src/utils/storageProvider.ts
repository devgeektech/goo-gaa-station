import path from 'path';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';
import { env } from '../config/env';
import { AppError } from './AppError';

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_MIMES_KYC = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_FILE_SIZE_2MB = 2 * 1024 * 1024; // 2MB for profile/logo/item images
export const MAX_FILE_SIZE_5MB = 5 * 1024 * 1024; // 5MB for vendor coverImage

function getExtension(mimetype: string): string {
  const map: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };
  return map[mimetype] || '.bin';
}

/**
 * Returns configured multer instance for uploads.
 * LOCAL: diskStorage to uploads/{folder}/, jpeg|png|webp only.
 * @param folder - subfolder under uploads (e.g. 'users')
 * @param maxSize - optional max file size in bytes (default 5MB; use MAX_FILE_SIZE_2MB for 2MB)
 */
export function getUploadMiddleware(folder: string, maxSize: number = MAX_FILE_SIZE): multer.Multer {
  const provider = (env.STORAGE_PROVIDER || 'local').toLowerCase();

  if (provider !== 'local') {
    // S3 not implemented — throw or fallback; for now fallback to local with fixed folder
    // throw new AppError({ en: 'S3 not configured', de: 'S3 nicht konfiguriert' }, 501);
  }

  {
    const uploadPath = path.join(process.cwd(), env.UPLOAD_DIR, folder);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    const storage = multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, uploadPath),
      filename: (_req, file, cb) => {
        const ext = getExtension(file.mimetype);
        const randomHex = crypto.randomBytes(8).toString('hex');
        cb(null, `${Date.now()}-${randomHex}${ext}`);
      },
    });

    const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
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

  // S3 TEMPLATE (disabled — uncomment and add multer-s3 + @aws-sdk/client-s3 when ready)
  // TODO: const { S3Client } = require('@aws-sdk/client-s3');
  // TODO: const multerS3 = require('multer-s3');
  // TODO: const s3 = new S3Client({ region: env.AWS_REGION, ... });
  // TODO: return multer({ storage: multerS3({ s3, bucket: env.AWS_BUCKET, key: ... }), ... });
}

/** Multer for KYC docs: image/* and application/pdf, 5MB. Use folder e.g. 'kyc'. */
export function getUploadMiddlewareKyc(folder: string, maxSize: number = MAX_FILE_SIZE): multer.Multer {
  const uploadPath = path.join(process.cwd(), env.UPLOAD_DIR, folder);
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
  }
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadPath),
    filename: (_req, file, cb) => {
      const ext = getExtension(file.mimetype);
      const randomHex = crypto.randomBytes(8).toString('hex');
      cb(null, `${Date.now()}-${randomHex}${ext}`);
    },
  });
  const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
    if (ALLOWED_MIMES_KYC.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          { en: 'Only jpeg, png, webp, pdf allowed', de: 'Nur jpeg, png, webp, pdf erlaubt' },
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

/** Delete file from disk if it exists (for image replace). Path can be /uploads/folder/file or relative. */
export function deleteLocalFile(filePath: string): void {
  if (!filePath) return;
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

/** Public URL for a file. Local: /uploads/folder/filename */
export function getFileUrl(filename: string, folder: string): string {
  if (env.STORAGE_PROVIDER === 's3') {
    // TODO: return s3 signed URL or public URL
    return `/uploads/${folder}/${filename}`;
  }
  return `/uploads/${folder}/${filename}`;
}
