import type { EpisodeProvider } from "@/lib/provider/interface";
import type {
  ProviderAnimeQuery,
  ProviderAnimeReference,
  ProviderEpisodesRequest,
  ProviderPageRequest,
  ProviderPlaybackRequest,
} from "@/lib/provider/types";

/** Stable AuraPlay facade. Provider-specific behavior remains in the selected adapter. */
export class KenjitsuProvider implements EpisodeProvider {
  constructor(private readonly adapter: EpisodeProvider) {}

  get key() { return this.adapter.key; }
  getCatalog(request?: ProviderPageRequest) { return this.adapter.getCatalog(request); }
  findAnime(query: ProviderAnimeQuery) { return this.adapter.findAnime(query); }
  getAnimeDetails(reference: ProviderAnimeReference) { return this.adapter.getAnimeDetails(reference); }
  getSeasons(reference: ProviderAnimeReference) { return this.adapter.getSeasons(reference); }
  getEpisodes(request: ProviderEpisodesRequest) { return this.adapter.getEpisodes(request); }
  getPlayback(request: ProviderPlaybackRequest) { return this.adapter.getPlayback(request); }
  healthCheck() { return this.adapter.healthCheck(); }
}
