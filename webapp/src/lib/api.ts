import {
  type AppEvent,
  AUTO_MASK_CONFIDENCE_THRESHOLD,
  formatGradeRange,
  generateId,
  type Outcome,
} from '@crux/shared';
import { type HSL } from '@crux/vision';
import { insertEvents, uploadMask, uploadPhoto } from '@crux/supabase-client';
import { preparePhotoForUpload } from './image';
import { buildMaskRgba, generateMaskFromPhoto, rgbaToBlob } from './mask';
import { getSupabaseClient } from './supabase';

export interface SessionSummary {
  id: string;
  startTs: Date;
  endTs: Date | null;
  problemCount: number;
  sendCount: number;
  flashCount: number;
}

export interface ProblemCardItem {
  problemId: string;
  imageUrl: string | null;
  maskUrl: string | null;
  outcome: Outcome | null;
  gradeLabel: string | null;
  attemptsCount: number | null;
}

export interface ProblemDetail {
  id: string;
  sessionId: string | null;
  imageUrl: string | null;
  maskUrl: string | null;
  maskConfidence: number | null;
  maskMethod: string | null;
  log: {
    outcome: Outcome;
    attemptsCount: number | null;
    gradeMin: number | null;
    gradeMax: number | null;
    note: string | null;
  } | null;
  media: {
    width: number | null;
    height: number | null;
  };
}

type SessionRow = {
  id: string;
  start_ts: string;
  end_ts: string | null;
};

type ProblemRow = {
  id: string;
  created_in_session_id: string | null;
  primary_media_id: string | null;
};

type MediaRow = {
  id: string;
  problem_id: string;
  type: 'photo' | 'mask';
  storage_path: string;
  width: number | null;
  height: number | null;
};

type RouteMaskRow = {
  problem_id: string;
  version: number;
  mask_media_id: string;
  confidence: number | null;
  method: string;
};

type LogRow = {
  id: string;
  problem_id: string;
  session_id: string;
  outcome: Outcome;
  attempts_count: number | null;
  grade_min: number | null;
  grade_max: number | null;
  note: string | null;
};

const SIGNED_URL_TTL_SECONDS = 60 * 60;

const getSignedUrl = async (path: string): Promise<string | null> => {
  const client = getSupabaseClient();
  const [bucket, ...parts] = path.split('/');
  const key = parts.join('/');
  if (!bucket || !key) return null;
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.warn('[getSignedUrl] Failed to sign storage path', { path, error: error.message });
    return null;
  }
  return data?.signedUrl ?? null;
};

const buildEvent = (params: Omit<AppEvent, 'id' | 'clientTs' | 'serverTs'>): AppEvent => ({
  id: generateId(),
  clientTs: new Date(),
  serverTs: null,
  ...params,
});

export async function getAuthUser() {
  const client = getSupabaseClient();
  console.log('[getAuthUser] Calling client.auth.getUser()...');
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('getUser timeout after 5s')), 5000)
  );
  try {
    const result = await Promise.race([client.auth.getUser(), timeoutPromise]);
    const { data, error } = result as { data: { user: unknown }; error: unknown };
    console.log('[getAuthUser] Result:', { user: data.user, error });
    if (error) throw new Error(String(error));
    return data.user;
  } catch (err) {
    console.error('[getAuthUser] Error:', err);
    throw err;
  }
}

export async function ensureUserProfile() {
  const client = getSupabaseClient();
  console.log('[ensureUserProfile] Getting auth user...');
  const user = await getAuthUser();
  console.log('[ensureUserProfile] Auth user:', user?.id);
  if (!user) return;
  const handle = user.email ? user.email.split('@')[0] : 'climber';
  console.log('[ensureUserProfile] Upserting user with handle:', handle);
  const { error } = await client.from('users').upsert({
    id: user.id,
    handle,
    created_at: new Date().toISOString(),
  });
  if (error) {
    console.error('[ensureUserProfile] Upsert error:', error);
  } else {
    console.log('[ensureUserProfile] Upsert complete');
  }
}

export async function fetchSessions(): Promise<SessionSummary[]> {
  const client = getSupabaseClient();
  const user = await getAuthUser();
  if (!user) return [];
  const { data: sessions, error } = await client
    .from('sessions')
    .select('*')
    .eq('user_id', user.id)
    .order('start_ts', { ascending: false });
  if (error) throw new Error(error.message);
  const sessionRows = (sessions ?? []) as SessionRow[];
  const sessionIds = sessionRows.map((row) => row.id);
  if (sessionIds.length === 0) return [];

  const { data: problems } = await client
    .from('problems')
    .select('id, created_in_session_id')
    .in('created_in_session_id', sessionIds);

  const { data: logs } = await client
    .from('user_problem_logs')
    .select('session_id, outcome')
    .in('session_id', sessionIds)
    .eq('user_id', user.id);

  return sessionRows.map((row) => {
    const sessionProblems = (problems ?? []).filter(
      (problem: { created_in_session_id: string | null }) =>
        problem.created_in_session_id === row.id
    );
    const sessionLogs = (logs ?? []).filter(
      (log: { session_id: string }) => log.session_id === row.id
    );
    return {
      id: row.id,
      startTs: new Date(row.start_ts),
      endTs: row.end_ts ? new Date(row.end_ts) : null,
      problemCount: sessionProblems.length,
      sendCount: sessionLogs.filter((log: { outcome: Outcome }) => log.outcome === 'send').length,
      flashCount: sessionLogs.filter((log: { outcome: Outcome }) => log.outcome === 'flash').length,
    };
  });
}

export async function createSession(): Promise<string> {
  const client = getSupabaseClient();
  const user = await getAuthUser();
  if (!user) throw new Error('Not signed in');
  const now = new Date();
  const sessionId = generateId();
  const { error } = await client.from('sessions').insert({
    id: sessionId,
    user_id: user.id,
    start_ts: now.toISOString(),
    end_ts: null,
    gym_label: null,
    created_at: now.toISOString(),
  });
  if (error) throw new Error(error.message);

  await insertEvents([
    buildEvent({
      userId: user.id,
      sessionId,
      problemId: null,
      type: 'session_started',
      payloadJson: { sessionId },
    }),
  ]);

  return sessionId;
}

export async function endSession(sessionId: string): Promise<void> {
  const client = getSupabaseClient();
  const user = await getAuthUser();
  if (!user) return;
  const now = new Date();
  const { error } = await client
    .from('sessions')
    .update({ end_ts: now.toISOString() })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);

  await insertEvents([
    buildEvent({
      userId: user.id,
      sessionId,
      problemId: null,
      type: 'session_ended',
      payloadJson: { sessionId },
    }),
  ]);
}

export async function fetchProblemsForSession(sessionId: string): Promise<ProblemCardItem[]> {
  const client = getSupabaseClient();
  const user = await getAuthUser();
  if (!user) return [];

  const { data: problems, error } = await client
    .from('problems')
    .select('*')
    .eq('created_in_session_id', sessionId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const problemRows = (problems ?? []) as ProblemRow[];
  const problemIds = problemRows.map((row) => row.id);
  if (problemIds.length === 0) return [];

  const { data: media } = await client.from('media').select('*').in('problem_id', problemIds);

  const { data: routeMasks } = await client
    .from('route_masks')
    .select('*')
    .in('problem_id', problemIds);

  const { data: logs } = await client
    .from('user_problem_logs')
    .select('*')
    .in('problem_id', problemIds)
    .eq('user_id', user.id);

  const mediaRows = (media ?? []) as MediaRow[];
  const maskRows = (routeMasks ?? []) as RouteMaskRow[];
  const logRows = (logs ?? []) as LogRow[];

  return Promise.all(
    problemRows.map(async (problem) => {
      const primaryMedia = mediaRows.find((entry) => entry.id === problem.primary_media_id);
      const mask = maskRows
        .filter((entry) => entry.problem_id === problem.id)
        .sort((a, b) => b.version - a.version)[0];
      const maskMedia = mask ? mediaRows.find((entry) => entry.id === mask.mask_media_id) : null;
      const log = logRows.find((entry) => entry.problem_id === problem.id);
      const gradeLabel =
        log && (log.grade_min !== null || log.grade_max !== null)
          ? formatGradeRange(log.grade_min, log.grade_max, 'v_scale')
          : null;

      return {
        problemId: problem.id,
        imageUrl: primaryMedia?.storage_path
          ? await getSignedUrl(primaryMedia.storage_path)
          : null,
        maskUrl: maskMedia?.storage_path ? await getSignedUrl(maskMedia.storage_path) : null,
        outcome: log?.outcome ?? null,
        gradeLabel,
        attemptsCount: log?.attempts_count ?? null,
      };
    })
  );
}

export async function fetchProblemDetail(problemId: string): Promise<ProblemDetail | null> {
  const client = getSupabaseClient();
  const user = await getAuthUser();
  if (!user) return null;

  const { data: problem, error } = await client
    .from('problems')
    .select('*')
    .eq('id', problemId)
    .single();
  if (error || !problem) return null;

  const { data: media } = await client.from('media').select('*').eq('problem_id', problemId);

  const { data: routeMasks } = await client
    .from('route_masks')
    .select('*')
    .eq('problem_id', problemId);

  const { data: logs } = await client
    .from('user_problem_logs')
    .select('*')
    .eq('problem_id', problemId)
    .eq('user_id', user.id);

  const mediaRows = (media ?? []) as MediaRow[];
  const maskRows = (routeMasks ?? []) as RouteMaskRow[];
  const logRows = (logs ?? []) as LogRow[];
  const photo = mediaRows.find((entry) => entry.id === problem.primary_media_id);
  const mask = maskRows.sort((a, b) => b.version - a.version)[0];
  const maskMedia = mask ? mediaRows.find((entry) => entry.id === mask.mask_media_id) : null;
  const log = logRows[0] ?? null;

  return {
    id: problem.id,
    sessionId: problem.created_in_session_id,
    imageUrl: photo?.storage_path ? await getSignedUrl(photo.storage_path) : null,
    maskUrl: maskMedia?.storage_path ? await getSignedUrl(maskMedia.storage_path) : null,
    maskConfidence: mask?.confidence ?? null,
    maskMethod: mask?.method ?? null,
    log: log
      ? {
          outcome: log.outcome,
          attemptsCount: log.attempts_count,
          gradeMin: log.grade_min,
          gradeMax: log.grade_max,
          note: log.note,
        }
      : null,
    media: {
      width: photo?.width ?? null,
      height: photo?.height ?? null,
    },
  };
}

export async function createProblemFromUpload(params: {
  sessionId: string;
  file: File;
}): Promise<string> {
  const client = getSupabaseClient();
  const user = await getAuthUser();
  if (!user) throw new Error('Not signed in');

  const now = new Date();
  const problemId = generateId();
  const photoMediaId = generateId();

  const processed = await preparePhotoForUpload(params.file);

  const { error: problemError } = await client.from('problems').insert({
    id: problemId,
    created_by: user.id,
    created_at: now.toISOString(),
    created_in_session_id: params.sessionId,
    primary_media_id: null,
    photo_phash: null,
  });
  if (problemError) throw new Error(problemError.message);

  await client.from('problem_members').insert({
    problem_id: problemId,
    user_id: user.id,
    role: 'owner',
    joined_at: now.toISOString(),
  });

  const upload = await uploadPhoto(problemId, photoMediaId, processed.photoBlob);

  const { error: mediaError } = await client.from('media').insert({
    id: photoMediaId,
    problem_id: problemId,
    type: 'photo',
    storage_path: upload.path,
    width: processed.width,
    height: processed.height,
    created_at: now.toISOString(),
    sha256: null,
    bytes: processed.bytes,
    metadata_json: {
      previewUrl: processed.previewUrl,
    },
  });
  if (mediaError) throw new Error(mediaError.message);

  const { error: problemUpdateError } = await client
    .from('problems')
    .update({ primary_media_id: photoMediaId })
    .eq('id', problemId);
  if (problemUpdateError) throw new Error(problemUpdateError.message);

  await insertEvents([
    buildEvent({
      userId: user.id,
      sessionId: params.sessionId,
      problemId,
      type: 'problem_created',
      payloadJson: {
        problemId,
        createdInSessionId: params.sessionId,
        primaryMediaId: photoMediaId,
      },
    }),
    buildEvent({
      userId: user.id,
      sessionId: params.sessionId,
      problemId,
      type: 'problem_media_added',
      payloadJson: { problemId, mediaId: photoMediaId, type: 'photo' },
    }),
  ]);

  const maskResult = await generateMaskFromPhoto({ uri: processed.processing.uri });
  const maskRgba = buildMaskRgba(maskResult.mask, maskResult.width, maskResult.height);
  const maskBlob = await rgbaToBlob(maskRgba, maskResult.width, maskResult.height);
  const maskMediaId = generateId();
  const maskUpload = await uploadMask(problemId, maskMediaId, maskBlob);

  const { error: maskMediaError } = await client.from('media').insert({
    id: maskMediaId,
    problem_id: problemId,
    type: 'mask',
    storage_path: maskUpload.path,
    width: maskResult.width,
    height: maskResult.height,
    created_at: now.toISOString(),
    sha256: null,
    bytes: maskBlob.size,
    metadata_json: null,
  });
  if (maskMediaError) throw new Error(maskMediaError.message);

  const routeMaskId = generateId();
  const { error: maskError } = await client.from('route_masks').insert({
    id: routeMaskId,
    problem_id: problemId,
    version: 1,
    mask_media_id: maskMediaId,
    method: maskResult.method,
    seed_color_json: maskResult.seedColor,
    confidence: maskResult.confidence,
    created_by: user.id,
    created_at: now.toISOString(),
  });
  if (maskError) throw new Error(maskError.message);

  await insertEvents([
    buildEvent({
      userId: user.id,
      sessionId: params.sessionId,
      problemId,
      type: 'problem_media_added',
      payloadJson: { problemId, mediaId: maskMediaId, type: 'mask' },
    }),
    buildEvent({
      userId: user.id,
      sessionId: params.sessionId,
      problemId,
      type: 'route_mask_created',
      payloadJson: {
        problemId,
        routeMaskId,
        method: maskResult.method,
        confidence: maskResult.confidence,
      },
    }),
  ]);

  return problemId;
}

export async function saveProblemLog(params: {
  problemId: string;
  sessionId: string;
  outcome: Outcome;
  attemptsCount: number | null;
  gradeMin: number | null;
  gradeMax: number | null;
  note: string | null;
}): Promise<void> {
  const client = getSupabaseClient();
  const user = await getAuthUser();
  if (!user) return;

  const { data: existing } = await client
    .from('user_problem_logs')
    .select('id')
    .eq('problem_id', params.problemId)
    .eq('session_id', params.sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  const logId = existing?.id ?? generateId();
  const now = new Date();

  const { error } = await client.from('user_problem_logs').upsert({
    id: logId,
    user_id: user.id,
    problem_id: params.problemId,
    session_id: params.sessionId,
    outcome: params.outcome,
    attempts_count: params.attemptsCount,
    grade_min: params.gradeMin,
    grade_max: params.gradeMax,
    note: params.note,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  if (error) throw new Error(error.message);

  await insertEvents([
    buildEvent({
      userId: user.id,
      sessionId: params.sessionId,
      problemId: params.problemId,
      type: 'user_problem_log_upserted',
      payloadJson: {
        userId: user.id,
        problemId: params.problemId,
        sessionId: params.sessionId,
        outcome: params.outcome,
        attemptsCount: params.attemptsCount,
        gradeMin: params.gradeMin,
        gradeMax: params.gradeMax,
      },
    }),
  ]);
}

export async function saveMaskVersion(params: {
  problemId: string;
  sessionId: string | null;
  mask: Uint8Array;
  width: number;
  height: number;
  method?: 'auto' | 'seed-color' | 'manual-edit' | 'color-dominant';
  seedColor?: HSL | null;
  confidence?: number | null;
}): Promise<string> {
  const client = getSupabaseClient();
  const user = await getAuthUser();
  if (!user) throw new Error('Not signed in');

  const { data: currentMasks } = await client
    .from('route_masks')
    .select('version')
    .eq('problem_id', params.problemId);
  const nextVersion =
    Math.max(
      0,
      ...(currentMasks ?? []).map((row: { version: number | null }) => row.version ?? 0)
    ) + 1;

  const rgba = buildMaskRgba(params.mask, params.width, params.height);
  const maskBlob = await rgbaToBlob(rgba, params.width, params.height);
  const maskMediaId = generateId();
  const upload = await uploadMask(params.problemId, maskMediaId, maskBlob);

  const now = new Date();
  const { error: mediaError } = await client.from('media').insert({
    id: maskMediaId,
    problem_id: params.problemId,
    type: 'mask',
    storage_path: upload.path,
    width: params.width,
    height: params.height,
    created_at: now.toISOString(),
    sha256: null,
    bytes: maskBlob.size,
    metadata_json: null,
  });
  if (mediaError) throw new Error(mediaError.message);

  const routeMaskId = generateId();
  const method = params.method ?? 'manual-edit';
  const confidence = params.confidence ?? null;
  const seedColor = params.seedColor ?? null;
  const { error } = await client.from('route_masks').insert({
    id: routeMaskId,
    problem_id: params.problemId,
    version: nextVersion,
    mask_media_id: maskMediaId,
    method,
    seed_color_json: seedColor,
    confidence,
    created_by: user.id,
    created_at: now.toISOString(),
  });
  if (error) throw new Error(error.message);

  await insertEvents([
    buildEvent({
      userId: user.id,
      sessionId: params.sessionId,
      problemId: params.problemId,
      type: 'problem_media_added',
      payloadJson: { problemId: params.problemId, mediaId: maskMediaId, type: 'mask' },
    }),
    buildEvent({
      userId: user.id,
      sessionId: params.sessionId,
      problemId: params.problemId,
      type: 'route_mask_updated',
      payloadJson: {
        problemId: params.problemId,
        routeMaskId,
        method,
        confidence,
      },
    }),
  ]);

  return upload.path;
}

export const getMaskConfidenceLabel = (confidence: number | null) => {
  if (confidence === null) return 'Manual';
  if (confidence < AUTO_MASK_CONFIDENCE_THRESHOLD) return 'Low confidence';
  return 'Ready';
};
