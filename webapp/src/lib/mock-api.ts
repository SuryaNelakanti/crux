import { formatGradeRange, generateId, type MaskMethod, type Outcome } from '@crux/shared';
import type { HSL } from '@crux/vision';
import type { ProblemCardItem, ProblemDetail, SessionSummary } from './api';
import { buildRouteMaskForCluster, detectHoldsFromPhoto, pickBestCluster } from './holds';
import { preparePhotoForUpload } from './image';
import { buildMaskRgba, generateMaskFromPhoto, rgbaToBlob } from './mask';

const STORAGE_KEY = 'crux.local-demo.v1';
const DB_NAME = 'crux-local-demo';
const DB_VERSION = 1;
const MEDIA_STORE = 'media';
const MOCK_USER_ID = 'local-climber';

type MockMediaRef = { kind: 'data-url'; value: string } | { kind: 'indexed-db'; key: string };

interface MockLog {
  outcome: Outcome;
  attemptsCount: number | null;
  gradeMin: number | null;
  gradeMax: number | null;
  note: string | null;
}

interface MockProblem {
  id: string;
  sessionId: string;
  image: MockMediaRef;
  mask: MockMediaRef | null;
  maskConfidence: number | null;
  maskMethod: string | null;
  width: number;
  height: number;
  createdAt: string;
  log: MockLog | null;
  maskVersion: number;
}

interface MockSession {
  id: string;
  startTs: string;
  endTs: string | null;
}

interface MockEvent {
  id: string;
  type: string;
  clientTs: string;
  sessionId: string | null;
  problemId: string | null;
  payload: Record<string, unknown>;
}

interface MockState {
  version: 1;
  sessions: MockSession[];
  problems: MockProblem[];
  events: MockEvent[];
}

const objectUrls = new Map<string, string>();

const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const wallPhoto = (accent: string, variant: 1 | 2 | 3) => {
  const holds =
    variant === 1
      ? `
        <ellipse cx="210" cy="970" rx="54" ry="25" transform="rotate(-15 210 970)"/>
        <path d="M335 865c34-24 86-16 102 20 12 30-12 64-54 70-48 7-82-18-70-51 4-14 10-27 22-39Z"/>
        <ellipse cx="468" cy="735" rx="46" ry="28" transform="rotate(22 468 735)"/>
        <path d="M540 580c45-28 93-8 96 34 2 35-35 63-81 52-42-10-53-55-15-86Z"/>
        <ellipse cx="655" cy="430" rx="53" ry="24" transform="rotate(-28 655 430)"/>
        <path d="M730 260c28-29 74-24 86 10 12 35-25 69-67 64-41-5-47-45-19-74Z"/>`
      : variant === 2
        ? `
        <path d="M165 1010c32-33 91-24 101 20 9 38-34 70-83 58-43-11-50-49-18-78Z"/>
        <ellipse cx="290" cy="870" rx="52" ry="24" transform="rotate(18 290 870)"/>
        <path d="M420 740c25-38 79-45 108-11 25 31 4 73-46 82-48 8-84-34-62-71Z"/>
        <ellipse cx="565" cy="610" rx="45" ry="26" transform="rotate(-17 565 610)"/>
        <path d="M650 465c42-20 88 5 81 45-6 36-52 55-91 31-37-23-29-58 10-76Z"/>
        <ellipse cx="735" cy="300" rx="49" ry="23" transform="rotate(30 735 300)"/>`
        : `
        <ellipse cx="230" cy="1020" rx="50" ry="23" transform="rotate(-18 230 1020)"/>
        <path d="M370 900c29-31 83-28 101 8 17 34-14 69-60 70-47 2-69-43-41-78Z"/>
        <ellipse cx="515" cy="770" rx="44" ry="25" transform="rotate(15 515 770)"/>
        <path d="M610 625c39-25 87-6 88 35 1 36-41 60-83 43-40-17-43-54-5-78Z"/>
        <ellipse cx="700" cy="470" rx="51" ry="24" transform="rotate(-22 700 470)"/>
        <path d="M735 290c32-31 78-18 83 20 4 35-35 62-73 48-36-14-39-41-10-68Z"/>`;

  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
      <rect width="900" height="1200" fill="#252420"/>
      <path d="M0 160 900 30v370L0 520Z" fill="#302f2a"/>
      <path d="M0 520 900 400v420L0 920Z" fill="#1e1d1a"/>
      <path d="M0 920 900 820v380H0Z" fill="#2d2b27"/>
      <g fill="#68645b" opacity=".55">
        <circle cx="120" cy="330" r="29"/><circle cx="330" cy="240" r="20"/>
        <circle cx="790" cy="700" r="32"/><circle cx="160" cy="730" r="24"/>
        <circle cx="540" cy="1030" r="27"/><circle cx="810" cy="1040" r="21"/>
      </g>
      <g fill="${accent}" stroke="#0f0f0d" stroke-width="8">${holds}</g>
      <path d="M45 1140h810" stroke="#d8d0bd" stroke-opacity=".12" stroke-width="4"/>
    </svg>
  `);
};

const routeMask = (accent: string, variant: 1 | 2 | 3) => {
  const path =
    variant === 1
      ? 'M210 970 385 910 468 735 588 620 655 430 772 295'
      : variant === 2
        ? 'M210 1040 290 870 470 770 565 610 686 500 760 320'
        : 'M230 1020 420 940 515 770 650 665 700 470 770 330';
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
      <path d="${path}" fill="none" stroke="${accent}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
      <path d="${path}" fill="none" stroke="#f2eee4" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `);
};

const createSeedState = (): MockState => {
  const now = Date.now();
  const activeSessionId = 'local-session-active';
  const previousSessionId = 'local-session-previous';
  return {
    version: 1,
    sessions: [
      {
        id: activeSessionId,
        startTs: new Date(now - 46 * 60 * 1000).toISOString(),
        endTs: null,
      },
      {
        id: previousSessionId,
        startTs: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(),
        endTs: new Date(now - 3 * 24 * 60 * 60 * 1000 + 92 * 60 * 1000).toISOString(),
      },
    ],
    problems: [
      {
        id: 'local-problem-1',
        sessionId: activeSessionId,
        image: { kind: 'data-url', value: wallPhoto('#a3b889', 1) },
        mask: { kind: 'data-url', value: routeMask('#a3b889', 1) },
        maskConfidence: 0.88,
        maskMethod: 'auto',
        width: 900,
        height: 1200,
        createdAt: new Date(now - 34 * 60 * 1000).toISOString(),
        log: {
          outcome: 'flash',
          attemptsCount: 1,
          gradeMin: 5,
          gradeMax: 5,
          note: 'Stayed tight through the last move.',
        },
        maskVersion: 1,
      },
      {
        id: 'local-problem-2',
        sessionId: activeSessionId,
        image: { kind: 'data-url', value: wallPhoto('#c69a78', 2) },
        mask: { kind: 'data-url', value: routeMask('#c69a78', 2) },
        maskConfidence: 0.76,
        maskMethod: 'auto',
        width: 900,
        height: 1200,
        createdAt: new Date(now - 18 * 60 * 1000).toISOString(),
        log: {
          outcome: 'send',
          attemptsCount: 3,
          gradeMin: 6,
          gradeMax: 6,
          note: null,
        },
        maskVersion: 1,
      },
      {
        id: 'local-problem-3',
        sessionId: previousSessionId,
        image: { kind: 'data-url', value: wallPhoto('#8ca8b0', 3) },
        mask: { kind: 'data-url', value: routeMask('#8ca8b0', 3) },
        maskConfidence: 0.61,
        maskMethod: 'auto',
        width: 900,
        height: 1200,
        createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000 + 35 * 60 * 1000).toISOString(),
        log: {
          outcome: 'tried',
          attemptsCount: 5,
          gradeMin: 7,
          gradeMax: 7,
          note: 'Come back fresh for the finish.',
        },
        maskVersion: 1,
      },
    ],
    events: [],
  };
};

const loadState = (): MockState => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as MockState;
      if (parsed.version === 1) return parsed;
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
  const seeded = createSeedState();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
};

const saveState = (state: MockState) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const appendEvent = (
  state: MockState,
  type: string,
  sessionId: string | null,
  problemId: string | null,
  payload: Record<string, unknown>
) => {
  state.events.push({
    id: generateId(),
    type,
    clientTs: new Date().toISOString(),
    sessionId,
    problemId,
    payload,
  });
};

const openMediaDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MEDIA_STORE)) {
        db.createObjectStore(MEDIA_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const putMedia = async (key: string, blob: Blob) => {
  const db = await openMediaDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, 'readwrite');
    transaction.objectStore(MEDIA_STORE).put(blob, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
};

const getMedia = async (key: string): Promise<Blob | null> => {
  const db = await openMediaDb();
  const result = await new Promise<Blob | null>((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE, 'readonly');
    const request = transaction.objectStore(MEDIA_STORE).get(key);
    request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
};

const resolveMedia = async (ref: MockMediaRef | null): Promise<string | null> => {
  if (!ref) return null;
  if (ref.kind === 'data-url') return ref.value;
  const cached = objectUrls.get(ref.key);
  if (cached) return cached;
  const blob = await getMedia(ref.key);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(ref.key, url);
  return url;
};

const countMask = (mask: Uint8Array) => {
  let hits = 0;
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index]) hits += 1;
  }
  return hits;
};

const computeRouteConfidence = (mask: Uint8Array, holdScores: number[]) => {
  if (mask.length === 0) return 0;
  const coverage = countMask(mask) / mask.length;
  const coverageScore =
    coverage < 0.005 || coverage > 0.5 ? 0 : 1 - Math.abs(coverage - 0.12) / 0.38;
  const avgHoldScore =
    holdScores.length === 0
      ? 0
      : holdScores.reduce((sum, score) => sum + score, 0) / holdScores.length;
  return Math.min(1, Math.max(0, avgHoldScore * 0.7 + coverageScore * 0.3));
};

export const getMockAuthUser = () => ({ id: MOCK_USER_ID, email: 'local@crux.test' });

export const ensureMockUserProfile = async () => undefined;

export const fetchMockSessions = async (): Promise<SessionSummary[]> => {
  const state = loadState();
  return state.sessions
    .map((session) => {
      const problems = state.problems.filter((problem) => problem.sessionId === session.id);
      return {
        id: session.id,
        startTs: new Date(session.startTs),
        endTs: session.endTs ? new Date(session.endTs) : null,
        problemCount: problems.length,
        sendCount: problems.filter((problem) => problem.log?.outcome === 'send').length,
        flashCount: problems.filter((problem) => problem.log?.outcome === 'flash').length,
      };
    })
    .sort((left, right) => right.startTs.getTime() - left.startTs.getTime());
};

export const createMockSession = async (): Promise<string> => {
  const state = loadState();
  const sessionId = generateId();
  state.sessions.unshift({
    id: sessionId,
    startTs: new Date().toISOString(),
    endTs: null,
  });
  appendEvent(state, 'session_started', sessionId, null, { sessionId });
  saveState(state);
  return sessionId;
};

export const endMockSession = async (sessionId: string): Promise<void> => {
  const state = loadState();
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return;
  session.endTs = new Date().toISOString();
  appendEvent(state, 'session_ended', sessionId, null, { sessionId });
  saveState(state);
};

export const fetchMockProblemsForSession = async (
  sessionId: string
): Promise<ProblemCardItem[]> => {
  const state = loadState();
  const problems = state.problems
    .filter((problem) => problem.sessionId === sessionId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return Promise.all(
    problems.map(async (problem) => ({
      problemId: problem.id,
      imageUrl: await resolveMedia(problem.image),
      maskUrl: await resolveMedia(problem.mask),
      outcome: problem.log?.outcome ?? null,
      gradeLabel:
        problem.log && (problem.log.gradeMin !== null || problem.log.gradeMax !== null)
          ? formatGradeRange(problem.log.gradeMin, problem.log.gradeMax, 'v_scale')
          : null,
      attemptsCount: problem.log?.attemptsCount ?? null,
    }))
  );
};

export const fetchMockProblemDetail = async (problemId: string): Promise<ProblemDetail | null> => {
  const problem = loadState().problems.find((candidate) => candidate.id === problemId);
  if (!problem) return null;
  return {
    id: problem.id,
    sessionId: problem.sessionId,
    imageUrl: await resolveMedia(problem.image),
    maskUrl: await resolveMedia(problem.mask),
    maskConfidence: problem.maskConfidence,
    maskMethod: problem.maskMethod,
    log: problem.log,
    media: {
      width: problem.width,
      height: problem.height,
    },
  };
};

export const createMockProblemFromUpload = async (params: {
  sessionId: string;
  file: File;
}): Promise<string> => {
  const processed = await preparePhotoForUpload(params.file);
  const problemId = generateId();
  const photoKey = `photo:${problemId}`;
  const maskKey = `mask:${problemId}:1`;
  await putMedia(photoKey, processed.photoBlob);

  const detection = await detectHoldsFromPhoto({
    uri: processed.processing.uri,
    maxWidth: processed.processing.width,
  });
  const bestCluster = pickBestCluster(detection);
  let mask = buildRouteMaskForCluster(detection, bestCluster);
  let method: MaskMethod = 'auto';
  let confidence = computeRouteConfidence(
    mask,
    detection.holds
      .filter((hold) => (bestCluster === null ? false : hold.clusterIndex === bestCluster))
      .map((hold) => hold.score)
  );

  if (mask.length === 0 || countMask(mask) === 0) {
    const fallback = await generateMaskFromPhoto({ uri: processed.processing.uri });
    mask = fallback.mask;
    method = fallback.method;
    confidence = fallback.confidence;
  }

  const maskRgba = buildMaskRgba(mask, detection.width, detection.height);
  const maskBlob = await rgbaToBlob(maskRgba, detection.width, detection.height);
  await putMedia(maskKey, maskBlob);

  const state = loadState();
  state.problems.unshift({
    id: problemId,
    sessionId: params.sessionId,
    image: { kind: 'indexed-db', key: photoKey },
    mask: { kind: 'indexed-db', key: maskKey },
    maskConfidence: confidence,
    maskMethod: method,
    width: detection.width,
    height: detection.height,
    createdAt: new Date().toISOString(),
    log: null,
    maskVersion: 1,
  });
  appendEvent(state, 'problem_created', params.sessionId, problemId, {
    problemId,
    createdInSessionId: params.sessionId,
  });
  appendEvent(state, 'route_mask_created', params.sessionId, problemId, {
    problemId,
    method,
    confidence,
  });
  saveState(state);
  return problemId;
};

export const saveMockProblemLog = async (params: {
  problemId: string;
  sessionId: string;
  outcome: Outcome;
  attemptsCount: number | null;
  gradeMin: number | null;
  gradeMax: number | null;
  note: string | null;
}): Promise<void> => {
  const state = loadState();
  const problem = state.problems.find((candidate) => candidate.id === params.problemId);
  if (!problem) return;
  problem.log = {
    outcome: params.outcome,
    attemptsCount: params.attemptsCount,
    gradeMin: params.gradeMin,
    gradeMax: params.gradeMax,
    note: params.note,
  };
  appendEvent(state, 'user_problem_log_upserted', params.sessionId, params.problemId, {
    userId: MOCK_USER_ID,
    ...params,
  });
  saveState(state);
};

export const saveMockMaskVersion = async (params: {
  problemId: string;
  sessionId: string | null;
  mask: Uint8Array;
  width: number;
  height: number;
  method?: MaskMethod;
  seedColor?: HSL | null;
  confidence?: number | null;
  metadataJson?: Record<string, unknown> | null;
}): Promise<string> => {
  const state = loadState();
  const problem = state.problems.find((candidate) => candidate.id === params.problemId);
  if (!problem) throw new Error('Problem not found');
  const nextVersion = problem.maskVersion + 1;
  const key = `mask:${params.problemId}:${nextVersion}`;
  const rgba = buildMaskRgba(params.mask, params.width, params.height);
  const blob = await rgbaToBlob(rgba, params.width, params.height);
  await putMedia(key, blob);
  const previousUrl = objectUrls.get(key);
  if (previousUrl) URL.revokeObjectURL(previousUrl);
  objectUrls.delete(key);
  problem.mask = { kind: 'indexed-db', key };
  problem.maskVersion = nextVersion;
  problem.maskMethod = params.method ?? 'manual-edit';
  problem.maskConfidence = params.confidence ?? null;
  appendEvent(state, 'route_mask_updated', params.sessionId, params.problemId, {
    problemId: params.problemId,
    version: nextVersion,
    method: problem.maskMethod,
    confidence: problem.maskConfidence,
    metadataJson: params.metadataJson ?? null,
  });
  saveState(state);
  return (await resolveMedia(problem.mask)) ?? '';
};

export const resetMockData = async () => {
  window.localStorage.removeItem(STORAGE_KEY);
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
  await new Promise<void>((resolve) => {
    const request = window.indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
};
