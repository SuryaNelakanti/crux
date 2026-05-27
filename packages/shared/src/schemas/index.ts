import { z } from 'zod';

/**
 * Zod schemas for Crux domain types
 *
 * Single source of truth for validation.
 * Use z.infer<typeof schema> to derive TS types if needed.
 */

// ============================================================================
// Enums
// ============================================================================

export const OutcomeSchema = z.enum(['flash', 'send', 'tried', 'project']);

export const AttemptsModeSchema = z.enum(['off', 'aggregate', 'per_attempt']);

export const GradeScaleSchema = z.enum(['v_scale', 'font', 'custom']);

export const MaskMethodSchema = z.enum([
  'auto',
  'color-dominant',
  'manual-edit',
  'seed-color',
  'ml-yolo26-seg',
  'ml-combo-v1',
]);

export const MediaTypeSchema = z.enum(['photo', 'mask']);

export const MemberRoleSchema = z.enum(['owner', 'member']);

export const EventTypeSchema = z.enum([
  'session_started',
  'session_ended',
  'problem_created',
  'problem_media_added',
  'route_mask_created',
  'route_mask_updated',
  'user_problem_log_upserted',
  'problem_share_link_created',
  'problem_joined',
]);

// ============================================================================
// Core Entity Schemas
// ============================================================================

export const UserSchema = z.object({
  id: z.string().uuid(),
  handle: z.string().min(1).max(50),
  createdAt: z.coerce.date(),
});

export const SessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  startTs: z.coerce.date(),
  endTs: z.coerce.date().nullable(),
  gymLabel: z.string().nullable(),
  createdAt: z.coerce.date(),
});

export const ProblemSchema = z.object({
  id: z.string().uuid(),
  createdBy: z.string().uuid(),
  createdAt: z.coerce.date(),
  createdInSessionId: z.string().uuid().nullable(),
  primaryMediaId: z.string().uuid().nullable(),
  photoPhash: z.string().nullable(),
});

export const ProblemMemberSchema = z.object({
  problemId: z.string().uuid(),
  userId: z.string().uuid(),
  role: MemberRoleSchema,
  joinedAt: z.coerce.date(),
});

export const ProblemShareLinkSchema = z.object({
  id: z.string().uuid(),
  problemId: z.string().uuid(),
  createdBy: z.string().uuid(),
  token: z.string().min(1),
  createdAt: z.coerce.date(),
  revokedAt: z.coerce.date().nullable(),
  expiresAt: z.coerce.date().nullable(),
});

export const MediaSchema = z.object({
  id: z.string().uuid(),
  problemId: z.string().uuid(),
  type: MediaTypeSchema,
  storagePath: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  createdAt: z.coerce.date(),
  sha256: z.string().nullable(),
  bytes: z.number().int().positive().nullable(),
  metadataJson: z.record(z.unknown()).nullable(),
});

export const SeedColorSchema = z.object({
  h: z.number().min(0).max(360),
  s: z.number().min(0).max(100),
  l: z.number().min(0).max(100),
});

export const RouteMaskSchema = z.object({
  id: z.string().uuid(),
  problemId: z.string().uuid(),
  version: z.number().int().positive(),
  maskMediaId: z.string().uuid(),
  method: MaskMethodSchema,
  seedColorJson: SeedColorSchema.nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  metadataJson: z.record(z.unknown()).nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.coerce.date(),
});

export const UserProblemLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  problemId: z.string().uuid(),
  sessionId: z.string().uuid(),
  outcome: OutcomeSchema,
  attemptsCount: z.number().int().positive().nullable(),
  gradeMin: z.number().int().min(0).nullable(), // V-scale normalized
  gradeMax: z.number().int().min(0).nullable(),
  note: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const UserSettingsSchema = z.object({
  userId: z.string().uuid(),
  attemptsMode: AttemptsModeSchema,
  gradeScale: GradeScaleSchema,
});

// ============================================================================
// Event Schemas
// ============================================================================

export const AppEventSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  problemId: z.string().uuid().nullable(),
  type: EventTypeSchema,
  payloadJson: z.record(z.unknown()),
  clientTs: z.coerce.date(),
  serverTs: z.coerce.date().nullable(),
});

// ============================================================================
// Event Payload Schemas
// ============================================================================

export const SessionStartedPayloadSchema = z.object({
  sessionId: z.string().uuid(),
  gymLabel: z.string().nullable(),
});

export const SessionEndedPayloadSchema = z.object({
  sessionId: z.string().uuid(),
});

export const ProblemCreatedPayloadSchema = z.object({
  problemId: z.string().uuid(),
  createdInSessionId: z.string().uuid().nullable(),
  primaryMediaId: z.string().uuid().nullable(),
});

export const ProblemMediaAddedPayloadSchema = z.object({
  problemId: z.string().uuid(),
  mediaId: z.string().uuid(),
  type: MediaTypeSchema,
});

export const RouteMaskCreatedPayloadSchema = z.object({
  problemId: z.string().uuid(),
  routeMaskId: z.string().uuid(),
  method: MaskMethodSchema,
  confidence: z.number().nullable(),
  metadataJson: z.record(z.unknown()).nullable().optional(),
});

export const RouteMaskUpdatedPayloadSchema = z.object({
  problemId: z.string().uuid(),
  routeMaskId: z.string().uuid(),
  method: MaskMethodSchema,
  confidence: z.number().nullable().optional(),
  metadataJson: z.record(z.unknown()).nullable().optional(),
});

export const UserProblemLogUpsertedPayloadSchema = z.object({
  userId: z.string().uuid(),
  problemId: z.string().uuid(),
  sessionId: z.string().uuid(),
  outcome: OutcomeSchema,
  attemptsCount: z.number().nullable(),
  gradeMin: z.number().nullable(),
  gradeMax: z.number().nullable(),
});

export const ProblemShareLinkCreatedPayloadSchema = z.object({
  problemId: z.string().uuid(),
  shareLinkId: z.string().uuid(),
});

export const ProblemJoinedPayloadSchema = z.object({
  problemId: z.string().uuid(),
});
