/** Matches API `MAX_FILE_SIZE_10MB` for customer/driver profile and vendor logo/cover images. */
export const MAX_PROFILE_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_VENDOR_IMAGE_BYTES = MAX_PROFILE_IMAGE_BYTES;

export function isProfileImageWithinLimit(file: File): boolean {
  return file.size <= MAX_PROFILE_IMAGE_BYTES;
}

export function isVendorImageWithinLimit(file: File): boolean {
  return file.size <= MAX_VENDOR_IMAGE_BYTES;
}

export const PROFILE_IMAGE_SIZE_LABEL = '10MB';
export const VENDOR_IMAGE_SIZE_LABEL = '10MB';
