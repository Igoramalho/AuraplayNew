import type { CatalogService, CatalogSyncResult } from "@/services/catalog.service";
import { SyncRunnerService, type SyncRunOptions, type SyncRunResult } from "./sync-runner.service";

type CatalogSyncPort = Pick<CatalogService, "syncHomeCatalog">;

export class CatalogSyncService {
  constructor(
    private readonly runner: SyncRunnerService,
    private readonly catalog: CatalogSyncPort,
  ) {}

  async sync(options: SyncRunOptions): Promise<SyncRunResult> {
    const normalized = { ...options, limit: Math.min(Math.max(options.limit, 1), 100) };
    return this.runner.run("catalog", normalized, async () => this.mapResult(await this.catalog.syncHomeCatalog(normalized.limit)));
  }

  private mapResult(result: CatalogSyncResult) {
    return {
      counters: {
        processed: result.processed,
        created: 0,
        updated: result.createdOrUpdated,
        skipped: Math.max(0, result.processed - result.createdOrUpdated),
        errors: 0,
      },
      nextCursor: null,
      metadata: { sections: result.sections },
    };
  }
}
