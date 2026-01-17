import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import {
    IMAGE_COMPRESSION_QUALITY,
    IMAGE_STORAGE_MAX_WIDTH,
    generateId,
    type MediaType,
} from '@crux/shared';

const PHOTO_DIR = `${FileSystem.documentDirectory ?? ''}media/photos`;

export interface ProcessedPhoto {
    localPath: string;
    width: number;
    height: number;
    bytes: number | null;
    thumbnailPath: string | null;
}

async function ensurePhotoDir(): Promise<void> {
    if (!FileSystem.documentDirectory) return;
    await FileSystem.makeDirectoryAsync(PHOTO_DIR, { intermediates: true });
}

export async function processCapturedPhoto(params: {
    uri: string;
    width: number;
    height: number;
}): Promise<ProcessedPhoto> {
    await ensurePhotoDir();
    const id = generateId();

    const targetWidth =
        params.width > IMAGE_STORAGE_MAX_WIDTH
            ? IMAGE_STORAGE_MAX_WIDTH
            : params.width;

    const resized = await ImageManipulator.manipulateAsync(
        params.uri,
        [{ resize: { width: targetWidth } }],
        { compress: IMAGE_COMPRESSION_QUALITY, format: ImageManipulator.SaveFormat.JPEG }
    );

    const localPath = `${PHOTO_DIR}/${id}.jpg`;
    await FileSystem.moveAsync({ from: resized.uri, to: localPath });

    const info = await FileSystem.getInfoAsync(localPath, { size: true });

    const thumbnail = await ImageManipulator.manipulateAsync(
        params.uri,
        [{ resize: { width: 360 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
    );
    const thumbnailPath = `${PHOTO_DIR}/${id}_thumb.jpg`;
    await FileSystem.moveAsync({ from: thumbnail.uri, to: thumbnailPath });

    return {
        localPath,
        width: resized.width ?? targetWidth,
        height: resized.height ?? params.height,
        bytes: info.exists ? info.size ?? null : null,
        thumbnailPath,
    };
}

export function getMediaTypeForFilename(filename: string): MediaType {
    return filename.endsWith('.png') ? 'mask' : 'photo';
}
