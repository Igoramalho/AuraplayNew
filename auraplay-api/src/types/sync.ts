import type { SyncJobStatus } from "@/constants/sync-status";

export interface SyncCounters {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
}

export interface SyncJob extends SyncCounters {
  id: string;
  jobType: string;
  status: SyncJobStatus;
  startedAt: string;
  finishedAt: string | null;
  errorSummary: string | null;
}
