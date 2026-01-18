import type { Media, Problem, RouteMask, Session, UserProblemLog } from '@crux/shared';

export type MediaWithLocalPath = Media & { localPath: string | null };

export const webStore = {
  sessions: [] as Session[],
  problems: [] as Problem[],
  media: [] as MediaWithLocalPath[],
  routeMasks: [] as RouteMask[],
  logs: [] as UserProblemLog[],
};
