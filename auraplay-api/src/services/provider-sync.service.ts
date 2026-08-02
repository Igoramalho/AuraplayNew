import type { EpisodeProvider } from "@/lib/provider/interface";
import { ProviderChain } from "../lib/provider/provider-chain";
import { SyncRunnerService, type SyncRunOptions, type SyncRunResult } from "./sync-runner.service";

export interface ProviderCatalogBatchSink {
  persist(items: Awaited<ReturnType<EpisodeProvider["getCatalog"]>>["items"]): Promise<{
    created: number;
    updated: number;
    skipped: number;
    needsReview?: number;
  }>;
}

export class ProviderSyncService {
  private readonly providers: ProviderChain;

  constructor(
    private readonly runner: SyncRunnerService,
    provider: EpisodeProvider | ProviderChain,
    private readonly sink?: ProviderCatalogBatchSink,
  ) { this.providers = provider instanceof ProviderChain ? provider : new ProviderChain([provider]); }

  async sync(options: SyncRunOptions): Promise<SyncRunResult> {
    const normalized = { ...options, limit: Math.min(Math.max(options.limit, 1), 100) };
    return this.runner.run("provider", normalized, async () => {
      const health = await this.providers.primary?.healthCheck();
      if (!health || health.status === "not_configured") {
        return {
          counters: { processed: 0, created: 0, updated: 0, skipped: 1, errors: 0 },
          nextCursor: normalized.cursor ?? null,
          partial: true,
          metadata: { reason: "PROVIDER_NOT_CONFIGURED" },
        };
      }
      if (!this.sink) throw Object.assign(new Error("Provider catalog sink não configurado."), { code: "PROVIDER_SINK_NOT_CONFIGURED" });

      const selected = await this.providers.getCatalog({ cursor: normalized.cursor, limit: normalized.limit });
      const batch = selected.result;
      const persisted = await this.sink.persist(batch.items);
      return {
        counters: { processed: batch.items.length, errors: 0, created: persisted.created, updated: persisted.updated, skipped: persisted.skipped },
        nextCursor: batch.nextCursor,
        partial: persisted.skipped > 0,
        metadata: { hasMore: batch.hasMore, providerKey: selected.provider?.key ?? null, needsReview: persisted.needsReview ?? 0 },
      };
    });
  }
}
