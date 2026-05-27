import { generateId } from '@crux/shared';
import { generateRouteMask, type HSL } from '@crux/vision';
import { AlphaType, ColorType, ImageFormat, type SkImage, Skia } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system';

const MASK_DIR = `${FileSystem.documentDirectory ?? ''}media/masks`;
const MASK_TINT = { r: 27, g: 175, b: 161, a: 180 };

const ensureMaskDir = async (): Promise<void> => {
  if (!FileSystem.documentDirectory) return;
  await FileSystem.makeDirectoryAsync(MASK_DIR, { intermediates: true });
};

export async function readImagePixels(uri: string): Promise<{
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) {
    throw new Error('Unable to decode image');
  }

  const width = image.width();
  const height = image.height();
  const info = {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  };

  const raw = image.readPixels(0, 0, info);
  if (!raw) {
    throw new Error('Unable to read pixels');
  }

  const pixels =
    raw instanceof Uint8ClampedArray
      ? raw
      : new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength);

  return { pixels, width, height };
}

export async function generateMaskFromPhoto(params: { uri: string; seedColor?: HSL }): Promise<{
  mask: Uint8Array;
  width: number;
  height: number;
  seedColor: HSL;
  confidence: number;
  method: 'auto' | 'seed-color';
}> {
  const { pixels, width, height } = await readImagePixels(params.uri);
  const result = generateRouteMask({
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

export function createMaskImage(params: {
  rgba: Uint8Array;
  width: number;
  height: number;
}): SkImage | null {
  const info = {
    width: params.width,
    height: params.height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  };
  const data = Skia.Data.fromBytes(params.rgba);
  return Skia.Image.MakeImage(info, data, params.width * 4);
}

export async function saveMaskToFile(params: {
  mask: Uint8Array;
  width: number;
  height: number;
}): Promise<{ localPath: string; bytes: number | null }> {
  await ensureMaskDir();
  const rgba = buildMaskRgba(params.mask, params.width, params.height);
  const image = createMaskImage({
    rgba,
    width: params.width,
    height: params.height,
  });
  if (!image) {
    throw new Error('Unable to encode mask');
  }

  const base64 = image.encodeToBase64(ImageFormat.PNG);
  const localPath = `${MASK_DIR}/${generateId()}.png`;
  await FileSystem.writeAsStringAsync(localPath, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const info = await FileSystem.getInfoAsync(localPath, { size: true });
  return { localPath, bytes: info.exists ? (info.size ?? null) : null };
}

export async function loadMaskPixels(uri: string): Promise<{
  mask: Uint8Array;
  rgba: Uint8Array;
  width: number;
  height: number;
}> {
  const { pixels, width, height } = await readImagePixels(uri);
  const rgba = new Uint8Array(pixels);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) {
    const alpha = rgba[i * 4 + 3];
    mask[i] = alpha > 0 ? 1 : 0;
  }
  return { mask, rgba, width, height };
}

export function applyBrushToMask(params: {
  mask: Uint8Array;
  rgba: Uint8Array;
  width: number;
  height: number;
  x: number;
  y: number;
  radius: number;
  mode: 'add' | 'erase';
  tint?: { r: number; g: number; b: number; a: number };
}): void {
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
}

export const maskTint = MASK_TINT;
