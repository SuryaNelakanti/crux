/**
 * Pure utility functions
 *
 * No platform dependencies - these should work anywhere.
 */

import { FONT_SCALE_GRADES, V_SCALE_GRADES } from '../constants';
import type { GradeScale } from '../domain';

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Convert normalized grade value to display label
 */
export function gradeToLabel(value: number, scale: GradeScale): string {
  const grades = scale === 'v_scale' ? V_SCALE_GRADES : FONT_SCALE_GRADES;
  const grade = grades.find((g) => g.value === value);
  return grade?.label ?? `${value}`;
}

/**
 * Format grade range for display
 */
export function formatGradeRange(
  min: number | null,
  max: number | null,
  scale: GradeScale
): string {
  if (min === null) {
    return max === null ? 'Ungraded' : gradeToLabel(max, scale);
  }
  if (max === null) return gradeToLabel(min, scale);
  if (min === max) return gradeToLabel(min, scale);
  return `${gradeToLabel(min, scale)}-${gradeToLabel(max, scale)}`;
}

/**
 * Format relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(startMs: number, endMs: number): string {
  const diffMs = endMs - startMs;
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const remainingMinutes = diffMinutes % 60;

  if (diffHours === 0) return `${diffMinutes}m`;
  if (remainingMinutes === 0) return `${diffHours}h`;
  return `${diffHours}h ${remainingMinutes}m`;
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Deterministic storage path for photos
 */
export function getPhotoStoragePath(problemId: string, mediaId: string): string {
  return `photos/${problemId}/${mediaId}.jpg`;
}

/**
 * Deterministic storage path for masks
 */
export function getMaskStoragePath(problemId: string, maskId: string): string {
  return `masks/${problemId}/${maskId}.png`;
}

/**
 * Calculate exponential backoff delay
 */
export function getBackoffDelay(retryCount: number, baseDelay: number = 1000): number {
  return Math.min(baseDelay * 2 ** retryCount, 60000); // Max 1 minute
}
