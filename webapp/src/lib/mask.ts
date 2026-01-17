import { generateMask, type HSL } from '@crux/vision';
import { readImagePixels } from './image';

const MASK_TINT = { r: 27, g: 175, b: 161, a: 180 };

export async function generateMaskFromPhoto(params: {
  uri: string;
  seedColor?: HSL;
}): Promise<{
  mask: Uint8Array;
  width: number;
  height: number;
  seedColor: HSL;
  confidence: number;
  method: 'auto' | 'seed-color';
}> {
  const { pixels, width, height } = await readImagePixels({ uri: params.uri });
  const result = generateMask({
    pixels,
    width,
    height,
    seedColor: params.seedColor,
  });
  return {
    mask: result.mask,
    width,
    height,
    seedColor: result.seedColor,
    confidence: result.confidence,
    method: result.method,
  };
}

export function buildMaskRgba(
  mask: Uint8Array,
  width: number,
  height: number,
  tint: { r: number; g: number; b: number; a: number } = MASK_TINT
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < mask.length; i += 1) {
    if (!mask[i]) continue;
    const offset = i * 4;
    rgba[offset] = tint.r;
    rgba[offset + 1] = tint.g;
    rgba[offset + 2] = tint.b;
    rgba[offset + 3] = tint.a;
  }
  return rgba;
}

export const applyBrushToMask = (params: {
  mask: Uint8Array;
  rgba: Uint8Array;
  width: number;
  height: number;
  x: number;
  y: number;
  radius: number;
  mode: 'add' | 'erase';
  tint?: { r: number; g: number; b: number; a: number };
}): void => {
  const { mask, rgba, width, height, x, y, radius, mode } = params;
  const tint = params.tint ?? MASK_TINT;
  const value = mode === 'add' ? 1 : 0;
  const r2 = radius * radius;
  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(width - 1, Math.ceil(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(height - 1, Math.ceil(y + radius));

  for (let yy = minY; yy <= maxY; yy += 1) {
    for (let xx = minX; xx <= maxX; xx += 1) {
      const dx = xx - x;
      const dy = yy - y;
      if (dx * dx + dy * dy > r2) continue;
      const idx = yy * width + xx;
      mask[idx] = value;
      const offset = idx * 4;
      if (value === 1) {
        rgba[offset] = tint.r;
        rgba[offset + 1] = tint.g;
        rgba[offset + 2] = tint.b;
        rgba[offset + 3] = tint.a;
      } else {
        rgba[offset + 3] = 0;
      }
    }
  }
};

export const rgbaToDataUrl = (rgba: Uint8Array, width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas unavailable');
  }
  const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
};

export const rgbaToBlob = (rgba: Uint8Array, width: number, height: number) =>
  new Promise<Blob>((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas unavailable'));
      return;
    }
    const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
    ctx.putImageData(imageData, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to encode mask'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });

export async function loadMaskPixelsFromUrl(uri: string): Promise<{
  mask: Uint8Array;
  rgba: Uint8Array;
  width: number;
  height: number;
}> {
  const { pixels, width, height } = await readImagePixels({ uri });
  const rgba = new Uint8Array(pixels);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) {
    const alpha = rgba[i * 4 + 3];
    mask[i] = alpha > 0 ? 1 : 0;
  }
  return { mask, rgba, width, height };
}

export const maskTint = MASK_TINT;
