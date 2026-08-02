import type { EpisodeSyncOptions } from "./episode-sync.service";
import type { CatalogSyncService } from "./catalog-sync.service";
import type { EpisodeSyncService } from "./episode-sync.service";
import type { ProviderSyncService } from "./provider-sync.service";
import type { SyncRunOptions } from "./sync-runner.service";

export class SyncService {
  constructor(
    private readonly catalog: CatalogSyncService,
    private readonly provider: ProviderSyncService,
    private readonly episodes: EpisodeSyncService,
  ) {}

  syncCatalog(options: SyncRunOptions) {
    return this.catalog.sync(options);
  }

  syncProvider(options: SyncRunOptions) {
    return this.provider.sync(options);
  }

  syncEpisodes(options: EpisodeSyncOptions) {
    return this.episodes.sync(options);
  }

  async syncAll(options: SyncRunOptions & { episodeTarget?: Pick<EpisodeSyncOptions, "providerKey" | "providerAnimeId" | "providerSeasonId"> }) {
    const catalog = await this.catalog.sync(options);
    const provider = await this.provider.sync(options);
    const episodes = await this.episodes.sync({ ...options, ...options.episodeTarget });
    return {
      status: [catalog, provider, episodes].some((result) => result.status !== "SUCCEEDED") ? "PARTIAL" as const : "SUCCEEDED" as const,
      catalog,
      provider,
      episodes,
    };
  }
}
