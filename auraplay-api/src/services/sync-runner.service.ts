import { randomUUID } from "node:crypto";

import type { SyncRepository } from "@/lib/supabase/repositories/sync.repository";
import type { Json } from "@/lib/supabase/database.types";
import type { SyncCounters } from "@/types/sync";

export interface SyncOperationResult {
  counters: SyncCounters;
  nextCursor: string | null;
  partial?: boolean;
  metadata?: Json;
}

export interface SyncRunResult extends SyncOperationResult {
  scope: string;
  jobId: string | null;
  status: "SUCCEEDED" | "PARTIAL" | "LOCKED";
}

export interface SyncRunOptions {
  cursor?: string;
  limit: number;
}

export class SyncAlreadyRunningError extends Error {
  constructor(public readonly scope: string) {
    super(`Sincronização já está em andamento para o escopo ${scope}.`);
    this.name = "SyncAlreadyRunningError";
  }
}

type SyncRepositoryPort = Pick<SyncRepository, "acquireLock" | "releaseLock" | "startJob" | "finishJob">;

function safeErrorSummary(error: unknown): string {
  if (typeof error === "object" && error && "code" in error && typeof error.code === "string") {
    return error.code.slice(0, 100);
  }
  return "UNEXPECTED_SYNC_ERROR";
}

export class SyncRunnerService {
  constructor(
    private readonly repository: SyncRepositoryPort,
    private readonly ownerId: () => string = randomUUID,
    private readonly now: () => number = Date.now,
  ) {}

  async run(scope: string, options: SyncRunOptions, operation: () => Promise<SyncOperationResult>): Promise<SyncRunResult> {
    const lockKey = `sync:${scope}`;
    const ownerId = this.ownerId();
    const acquired = await this.repository.acquireLock(lockKey, ownerId, 300);
    if (!acquired) {
      return {
        scope, jobId: null, status: "LOCKED", nextCursor: options.cursor ?? null,
        counters: { processed: 0, created: 0, updated: 0, skipped: 0, errors: 0 },
      };
    }

    const startedAt = this.now();
    try {
      const job = await this.repository.startJob(scope, {
        cursor: options.cursor ?? null,
        limit: options.limit,
      });
      try {
        const result = await operation();
        const status = result.partial || result.counters.errors > 0 ? "PARTIAL" : "SUCCEEDED";
        const durationMs = Math.max(0, this.now() - startedAt);
        await this.repository.finishJob(job.id, {
          status,
          processed_count: result.counters.processed,
          created_count: result.counters.created,
          updated_count: result.counters.updated,
          skipped_count: result.counters.skipped,
          error_count: result.counters.errors,
          error_summary: result.counters.errors > 0 ? "BATCH_COMPLETED_WITH_ERRORS" : null,
          metadata: { cursor: options.cursor ?? null, nextCursor: result.nextCursor, durationMs, result: result.metadata ?? {} },
        });
        return { ...result, scope, jobId: job.id, status };
      } catch (error) {
        const durationMs = Math.max(0, this.now() - startedAt);
        await this.repository.finishJob(job.id, {
          status: "FAILED",
          error_count: 1,
          error_summary: safeErrorSummary(error),
          metadata: { cursor: options.cursor ?? null, durationMs },
        });
        throw error;
      }
    } finally {
      await this.repository.releaseLock(lockKey, ownerId);
    }
  }
}
