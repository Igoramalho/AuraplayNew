import type { EpisodeProvider } from "@/lib/provider/interface";
import type { ProviderEpisode, ProviderPageRequest } from "@/lib/provider/types";
import { ProviderChain } from "../lib/provider/provider-chain";
import { providerNotConfigured } from "../lib/provider/errors";
import { SyncRunnerService, type SyncRunResult } from "./sync-runner.service";

export interface EpisodeBatchSink {
  persist(items: ProviderEpisode[]): Promise<{
    created: number;
    updated: number;
    skipped: number;
    rawSkipped?: number;
    sourceCreated?: number;
    sourceUpdated?: number;
    skippedReasons?: Record<string, number>;
  }>;
}

export interface EpisodeSyncOptions extends ProviderPageRequest {
  providerKey?: string;
  providerAnimeId?: string;
  providerSeasonId?: string;
}

export class EpisodeSyncService {
  private readonly providers: ProviderChain;

  constructor(
    private readonly runner: SyncRunnerService,
    provider: EpisodeProvider | ProviderChain,
    private readonly sink?: EpisodeBatchSink,
  ) { this.providers = provider instanceof ProviderChain ? provider : new ProviderChain([provider]); }

  async sync(options: EpisodeSyncOptions): Promise<SyncRunResult> {
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    return this.runner.run("episodes", { cursor: options.cursor, limit }, async () => {
      const primary = this.providers.primary;
      const health = await primary?.healthCheck();
      if (!health || health.status === "not_configured") {
        return {
          counters: { processed: 0, created: 0, updated: 0, skipped: 1, errors: 0 },
          nextCursor: options.cursor ?? null,
          partial: true,
          metadata: { reason: "PROVIDER_NOT_CONFIGURED" },
        };
      }
      if (!options.providerKey || !options.providerAnimeId || !options.providerSeasonId) {
        throw Object.assign(new Error("Alvo de episódios não informado."), { code: "EPISODE_TARGET_REQUIRED" });
      }
      const provider = this.providers.get(options.providerKey);
      if (!provider) throw providerNotConfigured();
      if (!this.sink) throw Object.assign(new Error("Episode sink não configurado."), { code: "EPISODE_SINK_NOT_CONFIGURED" });

      const batch = await provider.getEpisodes({
        providerKey: options.providerKey,
        providerAnimeId: options.providerAnimeId,
        providerSeasonId: options.providerSeasonId,
        cursor: options.cursor,
        limit,
      });
      const persisted = await this.sink.persist(batch.items);
      return {
        counters: { processed: batch.items.length, errors: 0, created: persisted.created, updated: persisted.updated, skipped: persisted.skipped },
        nextCursor: batch.nextCursor,
        partial: persisted.skipped > 0,
        metadata: {
          hasMore: batch.hasMore,
          providerKey: provider.key,
          rawSkipped: persisted.rawSkipped ?? 0,
          sourceCreated: persisted.sourceCreated ?? 0,
          sourceUpdated: persisted.sourceUpdated ?? 0,
          skippedReasons: persisted.skippedReasons ?? {},
        },
      };
    });
  }
}
