import {
  IMAGE_COMPRESSION_QUALITY,
  IMAGE_PROCESSING_MAX_WIDTH,
  IMAGE_STORAGE_MAX_WIDTH,
} from '@crux/shared';

const loadImage = (uri: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Unable to load image'));
    img.src = uri;
  });

export async function readImagePixels(params: {
  uri: string;
  maxWidth?: number;
}): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
  const img = await loadImage(params.uri);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const targetWidth = params.maxWidth ? Math.min(width, params.maxWidth) : width;
  const scale = targetWidth / width;
  const targetHeight = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas unavailable');
  }
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  const data = ctx.getImageData(0, 0, targetWidth, targetHeight);
  return { pixels: data.data, width: targetWidth, height: targetHeight };
}

const canvasToBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Unable to encode image'));
          return;
        }
        resolve(blob);
      },
      type,
      quality
    );
  });

export async function preparePhotoForUpload(file: File): Promise<{
  photoBlob: Blob;
  width: number;
  height: number;
  bytes: number | null;
  previewUrl: string;
  processing: { uri: string; width: number; height: number };
}> {
  const uri = URL.createObjectURL(file);
  const img = await loadImage(uri);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;

  const targetWidth = Math.min(width, IMAGE_STORAGE_MAX_WIDTH);
  const scale = targetWidth / width;
  const targetHeight = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas unavailable');
  }
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  const photoBlob = await canvasToBlob(canvas, 'image/jpeg', IMAGE_COMPRESSION_QUALITY);
  const previewUrl = canvas.toDataURL('image/jpeg', 0.8);

  const processingWidth = Math.min(width, IMAGE_PROCESSING_MAX_WIDTH);
  const processingScale = processingWidth / width;
  const processingHeight = Math.round(height * processingScale);
  const processingCanvas = document.createElement('canvas');
  processingCanvas.width = processingWidth;
  processingCanvas.height = processingHeight;
  const processingCtx = processingCanvas.getContext('2d');
  if (!processingCtx) {
    throw new Error('Canvas unavailable');
  }
  processingCtx.drawImage(img, 0, 0, processingWidth, processingHeight);
  const processingUrl = processingCanvas.toDataURL('image/jpeg', 0.9);

  URL.revokeObjectURL(uri);

  return {
    photoBlob,
    width: targetWidth,
    height: targetHeight,
    bytes: photoBlob.size,
    previewUrl,
    processing: { uri: processingUrl, width: processingWidth, height: processingHeight },
  };
}
