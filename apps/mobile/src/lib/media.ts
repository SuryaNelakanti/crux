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
    processingPath: string;
    processingWidth: number;
    processingHeight: number;
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

    let processingPath = localPath;
    let processingWidth = resized.width ?? targetWidth;
    let processingHeight = resized.height ?? params.height;

    if (processingWidth > IMAGE_PROCESSING_MAX_WIDTH) {
        const processing = await ImageManipulator.manipulateAsync(
            localPath,
            [{ resize: { width: IMAGE_PROCESSING_MAX_WIDTH } }],
            {
                compress: IMAGE_COMPRESSION_QUALITY,
                format: ImageManipulator.SaveFormat.JPEG,
            }
        );
        processingPath = `${PHOTO_DIR}/${id}_proc.jpg`;
        await FileSystem.moveAsync({ from: processing.uri, to: processingPath });
        processingWidth = processing.width ?? IMAGE_PROCESSING_MAX_WIDTH;
        processingHeight = processing.height ?? processingHeight;
    }

    return {
        localPath,
        width: resized.width ?? targetWidth,
        height: resized.height ?? params.height,
        bytes: info.exists ? info.size ?? null : null,
        thumbnailPath,
        processingPath,
        processingWidth,
        processingHeight,
    };
}

export function getMediaTypeForFilename(filename: string): MediaType {
    return filename.endsWith('.png') ? 'mask' : 'photo';
}
