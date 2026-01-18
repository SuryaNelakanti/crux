import {
  formatGradeRange,
  generateId,
  type Media,
  type Outcome,
  type Problem,
  type UserProblemLog,
} from '@crux/shared';
import { type MediaWithLocalPath, webStore } from './webStore';

export interface ProblemCardItem {
  problemId: string;
  imageUri: string | null;
  maskUri: string | null;
  outcome: Outcome | null;
  gradeLabel: string | null;
  attemptsCount: number | null;
}

export async function createProblemFromPhoto(params: {
  sessionId: string;
  localPath: string;
  width: number;
  height: number;
  bytes: number | null;
  metadataJson?: Record<string, unknown> | null;
}): Promise<{ problemId: string; mediaId: string }> {
  const now = new Date();
  const problemId = generateId();
  const mediaId = generateId();

  const problem: Problem = {
    id: problemId,
    createdBy: 'web-user-id',
    createdAt: now,
    createdInSessionId: params.sessionId,
    primaryMediaId: mediaId,
    photoPhash: null,
  };

  const media: MediaWithLocalPath = {
    id: mediaId,
    problemId,
    type: 'photo',
    storagePath: '',
    width: params.width,
    height: params.height,
    createdAt: now,
    sha256: null,
    bytes: params.bytes,
    metadataJson: params.metadataJson ?? null,
    localPath: params.localPath,
  };

  webStore.problems.unshift(problem);
  webStore.media.unshift(media);

  return { problemId, mediaId };
}

export async function getProblemCardsForSession(sessionId: string): Promise<ProblemCardItem[]> {
  const problems = webStore.problems.filter((problem) => problem.createdInSessionId === sessionId);

  return problems.map((problem) => {
    const media = webStore.media.find((entry) => entry.id === problem.primaryMediaId);
    const activeMask = webStore.routeMasks
      .filter((mask) => mask.problemId === problem.id)
      .sort((a, b) => b.version - a.version)[0];
    const maskMedia = activeMask
      ? webStore.media.find((entry) => entry.id === activeMask.maskMediaId)
      : null;
    const log = webStore.logs.find((entry) => entry.problemId === problem.id);

    const gradeLabel =
      !log || (log.gradeMin === null && log.gradeMax === null)
        ? null
        : formatGradeRange(log.gradeMin, log.gradeMax, 'v_scale');

    return {
      problemId: problem.id,
      imageUri: media?.localPath ?? null,
      maskUri: maskMedia?.localPath ?? null,
      outcome: log?.outcome ?? null,
      gradeLabel,
      attemptsCount: log?.attemptsCount ?? null,
    };
  });
}

export async function getProblemById(problemId: string): Promise<{
  problem: Problem;
  media: (Media & { localPath: string | null }) | null;
} | null> {
  const problem = webStore.problems.find((entry) => entry.id === problemId);
  if (!problem) return null;
  const media = webStore.media.find((entry) => entry.id === problem.primaryMediaId);
  return { problem, media: media ?? null };
}

export async function upsertUserProblemLog(params: {
  problemId: string;
  sessionId: string;
  outcome: Outcome;
  attemptsCount: number | null;
  gradeMin: number | null;
  gradeMax: number | null;
  note: string | null;
}): Promise<void> {
  const now = new Date();
  const existing = webStore.logs.find(
    (entry) => entry.problemId === params.problemId && entry.sessionId === params.sessionId
  );

  if (existing) {
    existing.outcome = params.outcome;
    existing.attemptsCount = params.attemptsCount;
    existing.gradeMin = params.gradeMin;
    existing.gradeMax = params.gradeMax;
    existing.note = params.note;
    existing.updatedAt = now;
    return;
  }

  const log: UserProblemLog = {
    id: generateId(),
    userId: 'web-user-id',
    problemId: params.problemId,
    sessionId: params.sessionId,
    outcome: params.outcome,
    attemptsCount: params.attemptsCount,
    gradeMin: params.gradeMin,
    gradeMax: params.gradeMax,
    note: params.note,
    createdAt: now,
    updatedAt: now,
  };
  webStore.logs.unshift(log);
}

export async function getUserProblemLog(
  problemId: string,
  sessionId: string
): Promise<UserProblemLog | null> {
  return (
    webStore.logs.find((entry) => entry.problemId === problemId && entry.sessionId === sessionId) ??
    null
  );
}
