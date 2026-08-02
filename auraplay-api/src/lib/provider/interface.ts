import type {
  ProviderAnimeDetails,
  ProviderAnimeMatch,
  ProviderAnimeQuery,
  ProviderAnimeReference,
  ProviderCatalogResult,
  ProviderEpisodesRequest,
  ProviderEpisodesResult,
  ProviderHealthResult,
  ProviderPageRequest,
  ProviderPlaybackRequest,
  ProviderPlaybackResult,
  ProviderSeason,
} from "./types";

export interface EpisodeProvider {
  readonly key: string;
  getCatalog(request?: ProviderPageRequest): Promise<ProviderCatalogResult>;
  findAnime(query: ProviderAnimeQuery): Promise<ProviderAnimeMatch[]>;
  getAnimeDetails(reference: ProviderAnimeReference): Promise<ProviderAnimeDetails>;
  getSeasons(reference: ProviderAnimeReference): Promise<ProviderSeason[]>;
  getEpisodes(request: ProviderEpisodesRequest): Promise<ProviderEpisodesResult>;
  getPlayback(request: ProviderPlaybackRequest): Promise<ProviderPlaybackResult>;
  healthCheck(): Promise<ProviderHealthResult>;
}
