import { providerFactory } from "@/lib/provider/factory";
import { createRepositories } from "@/lib/supabase/repositories";
import { AnimeService } from "@/services/anime.service";
import { EpisodeService } from "@/services/episode.service";
import { HealthService } from "@/services/health.service";
import { HomeService } from "@/services/home.service";
import { PlaybackService } from "@/services/playback.service";
import { SearchService } from "@/services/search.service";
import { AniListClient } from "@/lib/anilist/client";
import { RemoteAnimeSearchService } from "@/services/remote-anime-search.service";

export function createPublicServices() {
  const repositories = createRepositories();
  const providers = providerFactory.createOrdered();
  const provider = providers.primary ?? providerFactory.create();
  return {
    health: new HealthService(repositories.catalog, provider),
    home: new HomeService(repositories.catalog),
    search: new SearchService(repositories.anime),
    remoteSearch: new RemoteAnimeSearchService(new AniListClient()),
    anime: new AnimeService(repositories.anime, repositories.episode),
    episodes: new EpisodeService(repositories.anime, repositories.episode),
    playback: new PlaybackService(repositories.episode, providers),
  };
}
