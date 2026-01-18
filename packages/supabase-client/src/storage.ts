import { getMaskStoragePath, getPhotoStoragePath } from '@crux/shared';
import { getClient } from './client';

const PHOTOS_BUCKET = 'photos';
const MASKS_BUCKET = 'masks';

/**
 * Storage helpers for photo and mask uploads
 *
 * Uses deterministic paths for idempotent uploads.
 */

export interface UploadResult {
  path: string;
  publicUrl: string | null;
}

/**
 * Upload a photo to storage
 */
export async function uploadPhoto(
  problemId: string,
  mediaId: string,
  file: Blob | ArrayBuffer
): Promise<UploadResult> {
  const client = getClient();
  const path = getPhotoStoragePath(problemId, mediaId).replace('photos/', '');

  const { error } = await client.storage.from(PHOTOS_BUCKET).upload(path, file, {
    contentType: 'image/jpeg',
    upsert: true, // Idempotent
  });

  if (error) {
    throw new Error(`Failed to upload photo: ${error.message}`);
  }

  const { data: urlData } = client.storage.from(PHOTOS_BUCKET).getPublicUrl(path);

  return {
    path: `${PHOTOS_BUCKET}/${path}`,
    publicUrl: urlData?.publicUrl ?? null,
  };
}

/**
 * Upload a mask to storage
 */
export async function uploadMask(
  problemId: string,
  maskId: string,
  file: Blob | ArrayBuffer
): Promise<UploadResult> {
  const client = getClient();
  const path = getMaskStoragePath(problemId, maskId).replace('masks/', '');

  const { error } = await client.storage.from(MASKS_BUCKET).upload(path, file, {
    contentType: 'image/png',
    upsert: true, // Idempotent
  });

  if (error) {
    throw new Error(`Failed to upload mask: ${error.message}`);
  }

  const { data: urlData } = client.storage.from(MASKS_BUCKET).getPublicUrl(path);

  return {
    path: `${MASKS_BUCKET}/${path}`,
    publicUrl: urlData?.publicUrl ?? null,
  };
}

/**
 * Get signed URL for a photo (for private buckets)
 */
export async function getPhotoSignedUrl(
  problemId: string,
  mediaId: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  const client = getClient();
  const path = getPhotoStoragePath(problemId, mediaId).replace('photos/', '');

  const { data, error } = await client.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    console.error('Failed to get signed URL:', error.message);
    return null;
  }

  return data?.signedUrl ?? null;
}

/**
 * Get signed URL for a mask (for private buckets)
 */
export async function getMaskSignedUrl(
  problemId: string,
  maskId: string,
  expiresInSeconds: number = 3600
): Promise<string | null> {
  const client = getClient();
  const path = getMaskStoragePath(problemId, maskId).replace('masks/', '');

  const { data, error } = await client.storage
    .from(MASKS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    console.error('Failed to get signed URL:', error.message);
    return null;
  }

  return data?.signedUrl ?? null;
}

/**
 * Delete a photo from storage
 */
export async function deletePhoto(problemId: string, mediaId: string): Promise<void> {
  const client = getClient();
  const path = getPhotoStoragePath(problemId, mediaId).replace('photos/', '');

  const { error } = await client.storage.from(PHOTOS_BUCKET).remove([path]);

  if (error) {
    throw new Error(`Failed to delete photo: ${error.message}`);
  }
}

/**
 * Delete a mask from storage
 */
export async function deleteMask(problemId: string, maskId: string): Promise<void> {
  const client = getClient();
  const path = getMaskStoragePath(problemId, maskId).replace('masks/', '');

  const { error } = await client.storage.from(MASKS_BUCKET).remove([path]);

  if (error) {
    throw new Error(`Failed to delete mask: ${error.message}`);
  }
}
