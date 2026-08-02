export const PLAYBACK_STATUSES = [
  "METADATA_ONLY",
  "MATCH_PENDING",
  "MATCHING",
  "MATCHED",
  "SYNCING",
  "READY",
  "UNAVAILABLE",
  "ERROR",
  "NEEDS_REVIEW",
] as const;

export type PlaybackStatus = (typeof PLAYBACK_STATUSES)[number];

export const MATCH_STATUSES = [
  "PENDING",
  "AUTO_MATCHED",
  "MATCHED",
  "NOT_FOUND",
  "AMBIGUOUS",
  "NEEDS_REVIEW",
  "REJECTED",
] as const;

export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const SYNC_JOB_STATUSES = ["RUNNING", "SUCCEEDED", "PARTIAL", "FAILED"] as const;
export type SyncJobStatus = (typeof SYNC_JOB_STATUSES)[number];
