import { AniListClient } from "@/lib/anilist/client";
import { providerFactory } from "@/lib/provider/factory";
import { createRepositories } from "@/lib/supabase/repositories";
import { CatalogService } from "@/services/catalog.service";
import { CatalogSyncService } from "@/services/catalog-sync.service";
import { EpisodeSyncService } from "@/services/episode-sync.service";
import { ProviderSyncService } from "@/services/provider-sync.service";
import { SyncRunnerService } from "@/services/sync-runner.service";
import { SyncService } from "@/services/sync.service";
import { EpisodePersistenceSink, ProviderCatalogPersistenceSink } from "@/services/provider-persistence.sink";
import { AnimeMetadataService } from "@/services/anime-metadata.service";
import { AnimeDiscoveryService } from "@/services/anime-discovery.service";

export function createInternalServices() {
  const repositories = createRepositories();
  const runner = new SyncRunnerService(repositories.sync);
  const providers = providerFactory.createOrdered();
  const provider = providers.primary ?? providerFactory.create();
  const providerSink = new ProviderCatalogPersistenceSink(repositories.providerPersistence);
  const episodeSink = new EpisodePersistenceSink(repositories.providerPersistence);
  const catalog = new CatalogService(new AniListClient(), repositories.anime, repositories.catalog);
  const episodeSync = new EpisodeSyncService(runner, providers, episodeSink);
  return {
    sync: new SyncService(
      new CatalogSyncService(runner, catalog),
      new ProviderSyncService(runner, providers, providerSink),
      episodeSync,
    ),
    animeDiscovery: new AnimeDiscoveryService(
      new AniListClient(),
      new AnimeMetadataService(repositories.anime),
      repositories.anime,
      repositories.providerPersistence,
      providers,
      providerSink,
      episodeSync,
    ),
    episodeTargetRequired: provider.key !== "not_configured",
  };
}
