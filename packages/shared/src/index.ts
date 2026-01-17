/**
 * @crux/shared
 * 
 * Shared domain logic for Crux app.
 * Contains types, schemas, constants, and pure utilities.
 * 
 * Rules:
 * - No React, no Expo, no platform APIs
 * - All functions must be pure and deterministic
 * - Types and schemas are the single source of truth
 */

// Domain types
export * from './domain';

// Zod schemas
export * from './schemas';

// Constants
export * from './constants';

// Utilities
export * from './utils';
