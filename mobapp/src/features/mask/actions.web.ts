import type { HSL } from '@crux/vision';
import { createRouteMask, getActiveRouteMaskForProblem } from '@/lib/db';
import { generateMaskFromPhoto, saveMaskToFile } from './processing.web';

export async function generateAutoMaskForProblem(params: {
    problemId: string;
    photoUri: string;
}): Promise<void> {
    const generated = await generateMaskFromPhoto({ uri: params.photoUri });
    const saved = await saveMaskToFile({
        mask: generated.mask,
        width: generated.width,
        height: generated.height,
    });
    await createRouteMask({
        problemId: params.problemId,
        localPath: saved.localPath,
        width: generated.width,
        height: generated.height,
        bytes: saved.bytes,
        method: generated.method,
        seedColorJson: generated.seedColor,
        confidence: generated.confidence,
    });
}

export async function generateSeedMaskForProblem(params: {
    problemId: string;
    photoUri: string;
    seedColor: HSL;
}): Promise<void> {
    const generated = await generateMaskFromPhoto({
        uri: params.photoUri,
        seedColor: params.seedColor,
    });
    const saved = await saveMaskToFile({
        mask: generated.mask,
        width: generated.width,
        height: generated.height,
    });
    await createRouteMask({
        problemId: params.problemId,
        localPath: saved.localPath,
        width: generated.width,
        height: generated.height,
        bytes: saved.bytes,
        method: 'seed-color',
        seedColorJson: generated.seedColor,
        confidence: generated.confidence,
    });
}

export async function saveEditedMaskForProblem(params: {
    problemId: string;
    mask: Uint8Array;
    width: number;
    height: number;
}): Promise<void> {
    const saved = await saveMaskToFile({
        mask: params.mask,
        width: params.width,
        height: params.height,
    });
    await createRouteMask({
        problemId: params.problemId,
        localPath: saved.localPath,
        width: params.width,
        height: params.height,
        bytes: saved.bytes,
        method: 'manual-edit',
        seedColorJson: null,
        confidence: null,
    });
}

export async function createBlankMaskForProblem(params: {
    problemId: string;
    width: number;
    height: number;
}): Promise<void> {
    const mask = new Uint8Array(params.width * params.height);
    const saved = await saveMaskToFile({
        mask,
        width: params.width,
        height: params.height,
    });
    await createRouteMask({
        problemId: params.problemId,
        localPath: saved.localPath,
        width: params.width,
        height: params.height,
        bytes: saved.bytes,
        method: 'manual-edit',
        seedColorJson: null,
        confidence: null,
    });
}

export { getActiveRouteMaskForProblem };
