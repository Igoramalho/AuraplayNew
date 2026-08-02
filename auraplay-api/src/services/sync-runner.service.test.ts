import { describe, expect, it, vi } from "vitest";

import type { SyncJobRow } from "../lib/supabase/database.types";
import { SyncRunnerService } from "./sync-runner.service";

function job(overrides: Partial<SyncJobRow> = {}): SyncJobRow {
  return {
    id: "job-1", job_type: "catalog", status: "RUNNING", started_at: "2026-01-01T00:00:00Z", finished_at: null,
    processed_count: 0, created_count: 0, updated_count: 0, skipped_count: 0, error_count: 0,
    error_summary: null, metadata: {}, ...overrides,
  };
}

function repository(acquired = true) {
  return {
    acquireLock: vi.fn(async () => acquired),
    releaseLock: vi.fn(async () => true),
    startJob: vi.fn(async () => job()),
    finishJob: vi.fn(async (_id: string, update: Partial<SyncJobRow>) => job(update)),
  };
}

const emptyCounters = { processed: 0, created: 0, updated: 0, skipped: 0, errors: 0 };

describe("SyncRunnerService", () => {
  it("adquire lock, registra SUCCEEDED e libera em sucesso", async () => {
    const repo = repository();
    const clock = vi.fn().mockReturnValueOnce(1_000).mockReturnValueOnce(1_250);
    const runner = new SyncRunnerService(repo, () => "owner-1", clock);
    const result = await runner.run("catalog", { limit: 20 }, async () => ({ counters: { ...emptyCounters, processed: 2, updated: 2 }, nextCursor: null }));

    expect(result.status).toBe("SUCCEEDED");
    expect(repo.acquireLock).toHaveBeenCalledWith("sync:catalog", "owner-1", 300);
    expect(repo.finishJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "SUCCEEDED", processed_count: 2, updated_count: 2 }));
    expect(repo.releaseLock).toHaveBeenCalledWith("sync:catalog", "owner-1");
  });

  it("retorna LOCKED sem criar job quando o lock está ocupado", async () => {
    const repo = repository(false);
    const operation = vi.fn(async () => ({ counters: emptyCounters, nextCursor: null }));
    const result = await new SyncRunnerService(repo, () => "owner-2").run("catalog", { cursor: "c1", limit: 10 }, operation);
    expect(result).toMatchObject({ status: "LOCKED", jobId: null, nextCursor: "c1" });
    expect(operation).not.toHaveBeenCalled();
    expect(repo.startJob).not.toHaveBeenCalled();
    expect(repo.releaseLock).not.toHaveBeenCalled();
  });

  it("registra PARTIAL e sempre libera o lock", async () => {
    const repo = repository();
    const result = await new SyncRunnerService(repo, () => "owner-3").run("provider", { limit: 10 }, async () => ({
      counters: { ...emptyCounters, skipped: 1 }, nextCursor: null, partial: true,
    }));
    expect(result.status).toBe("PARTIAL");
    expect(repo.finishJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "PARTIAL", skipped_count: 1 }));
    expect(repo.releaseLock).toHaveBeenCalledOnce();
  });

  it("registra FAILED, oculta mensagem sensível e libera o lock em erro", async () => {
    const repo = repository();
    const failure = Object.assign(new Error("https://private.example?token=secret"), { code: "ANILIST_UNAVAILABLE" });
    await expect(new SyncRunnerService(repo, () => "owner-4").run("catalog", { limit: 10 }, async () => { throw failure; })).rejects.toBe(failure);
    expect(repo.finishJob).toHaveBeenCalledWith("job-1", expect.objectContaining({ status: "FAILED", error_count: 1, error_summary: "ANILIST_UNAVAILABLE" }));
    expect(JSON.stringify(repo.finishJob.mock.calls)).not.toContain("private.example");
    expect(repo.releaseLock).toHaveBeenCalledOnce();
  });

  it("libera o lock mesmo quando a criação do job falha", async () => {
    const repo = repository();
    repo.startJob.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(new SyncRunnerService(repo, () => "owner-5").run("catalog", { limit: 10 }, async () => ({ counters: emptyCounters, nextCursor: null }))).rejects.toThrow();
    expect(repo.releaseLock).toHaveBeenCalledWith("sync:catalog", "owner-5");
  });
});
