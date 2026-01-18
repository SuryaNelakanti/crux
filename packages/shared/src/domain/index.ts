/**
 * Domain types for Crux
 *
 * These are the core entity types used throughout the app.
 * All types are inferred from Zod schemas for single source of truth.
 */

// ============================================================================
// Enums
// ============================================================================

export type Outcome = 'flash' | 'send' | 'tried' | 'project';

export type AttemptsMode = 'off' | 'aggregate' | 'per_attempt';

export type GradeScale = 'v_scale' | 'font' | 'custom';

export type MaskMethod = 'auto' | 'color-dominant' | 'manual-edit' | 'seed-color';

export type MediaType = 'photo' | 'mask';

export type MemberRole = 'owner' | 'member';

// ============================================================================
// Core Entities
// ============================================================================

/**
 * User profile
 */
export interface User {
  id: string;
  handle: string;
  createdAt: Date;
}

/**
 * Climbing session
 */
export interface Session {
  id: string;
  userId: string;
  startTs: Date;
  endTs: Date | null;
  gymLabel: string | null;
  createdAt: Date;
}

/**
 * Climbing problem (canonical object)
 */
export interface Problem {
  id: string;
  createdBy: string;
  createdAt: Date;
  createdInSessionId: string | null;
  primaryMediaId: string | null;
  photoPhash: string | null;
}

/**
 * Problem membership (sharing)
 */
export interface ProblemMember {
  problemId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
}

/**
 * Problem share link
 */
export interface ProblemShareLink {
  id: string;
  problemId: string;
  createdBy: string;
  token: string;
  createdAt: Date;
  revokedAt: Date | null;
  expiresAt: Date | null;
}

/**
 * Media object (photo or mask)
 */
export interface Media {
  id: string;
  problemId: string;
  type: MediaType;
  storagePath: string;
  width: number;
  height: number;
  createdAt: Date;
  sha256: string | null;
  bytes: number | null;
  metadataJson: Record<string, unknown> | null;
}

/**
 * Route mask (versioned)
 */
export interface RouteMask {
  id: string;
  problemId: string;
  version: number;
  maskMediaId: string;
  method: MaskMethod;
  seedColorJson: { h: number; s: number; l: number } | null;
  confidence: number | null;
  createdBy: string;
  createdAt: Date;
}

/**
 * User's log for a problem in a session
 */
export interface UserProblemLog {
  id: string;
  userId: string;
  problemId: string;
  sessionId: string;
  outcome: Outcome;
  attemptsCount: number | null;
  gradeMin: number | null;
  gradeMax: number | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User settings
 */
export interface UserSettings {
  userId: string;
  attemptsMode: AttemptsMode;
  gradeScale: GradeScale;
}

// ============================================================================
// Event Types
// ============================================================================

export type EventType =
  | 'session_started'
  | 'session_ended'
  | 'problem_created'
  | 'problem_media_added'
  | 'route_mask_created'
  | 'route_mask_updated'
  | 'user_problem_log_upserted'
  | 'problem_share_link_created'
  | 'problem_joined';

/**
 * Append-only event
 */
export interface AppEvent {
  id: string;
  userId: string;
  sessionId: string | null;
  problemId: string | null;
  type: EventType;
  payloadJson: Record<string, unknown>;
  clientTs: Date;
  serverTs: Date | null;
}

// ============================================================================
// Local-only Types
// ============================================================================

/**
 * Outbox event (pending sync)
 */
export interface OutboxEvent {
  id: string;
  eventId: string;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  lastError: string | null;
  createdAt: Date;
}

/**
 * Outbox media (pending upload)
 */
export interface OutboxMedia {
  id: string;
  mediaId: string;
  localPath: string;
  status: 'pending' | 'uploading' | 'failed';
  retryCount: number;
  lastError: string | null;
  createdAt: Date;
}

/**
 * Sync state tracking
 */
export interface SyncState {
  lastServerTs: Date | null;
  lastSyncAt: Date | null;
}
