import { generateId, type MaskMethod } from '@crux/shared';
import { webStore, type MediaWithLocalPath } from './webStore';

export async function createRouteMask(params: {
    problemId: string;
    localPath: string;
    width: number;
    height: number;
    bytes: number | null;
    method: MaskMethod;
    seedColorJson: { h: number; s: number; l: number } | null;
    confidence: number | null;
}): Promise<{ routeMaskId: string; mediaId: string; version: number }> {
    const now = new Date();
    const version =
        Math.max(
            0,
            ...webStore.routeMasks
                .filter((mask) => mask.problemId === params.problemId)
                .map((mask) => mask.version)
        ) + 1;

    const mediaId = generateId();
    const routeMaskId = generateId();

    const media: MediaWithLocalPath = {
        id: mediaId,
        problemId: params.problemId,
        type: 'mask',
        storagePath: '',
        width: params.width,
        height: params.height,
        createdAt: now,
        sha256: null,
        bytes: params.bytes,
        metadataJson: null,
        localPath: params.localPath,
    };

    webStore.media.unshift(media);
    webStore.routeMasks.unshift({
        id: routeMaskId,
        problemId: params.problemId,
        version,
        maskMediaId: mediaId,
        method: params.method,
        seedColorJson: params.seedColorJson,
        confidence: params.confidence,
        createdBy: 'web-user-id',
        createdAt: now,
    });

    return { routeMaskId, mediaId, version };
}

export async function getActiveRouteMaskForProblem(problemId: string): Promise<{
    id: string;
    problemId: string;
    version: number;
    maskMediaId: string;
    method: MaskMethod;
    seedColorJson: { h: number; s: number; l: number } | null;
    confidence: number | null;
    createdBy: string;
    createdAt: Date;
    localPath: string | null;
} | null> {
    const masks = webStore.routeMasks
        .filter((mask) => mask.problemId === problemId)
        .sort((a, b) => b.version - a.version);
    const active = masks[0];
    if (!active) return null;
    const media = webStore.media.find((entry) => entry.id === active.maskMediaId);
    return {
        ...active,
        localPath: media?.localPath ?? null,
    };
}
