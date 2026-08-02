import { providerNotConfigured } from "./errors";
import type { EpisodeProvider } from "./interface";
import type {
  ProviderAnimeDetails,
  ProviderAnimeMatch,
  ProviderCatalogResult,
  ProviderEpisodesResult,
  ProviderHealthResult,
  ProviderPlaybackResult,
  ProviderSeason,
} from "./types";

export class PlaceholderProvider implements EpisodeProvider {
  readonly key = "not_configured";

  async getCatalog(): Promise<ProviderCatalogResult> { throw providerNotConfigured(); }
  async findAnime(): Promise<ProviderAnimeMatch[]> { throw providerNotConfigured(); }
  async getAnimeDetails(): Promise<ProviderAnimeDetails> { throw providerNotConfigured(); }
  async getSeasons(): Promise<ProviderSeason[]> { throw providerNotConfigured(); }
  async getEpisodes(): Promise<ProviderEpisodesResult> { throw providerNotConfigured(); }
  async getPlayback(): Promise<ProviderPlaybackResult> { throw providerNotConfigured(); }

  async healthCheck(): Promise<ProviderHealthResult> {
    return {
      providerKey: null,
      status: "not_configured",
      checkedAt: new Date().toISOString(),
      latencyMs: null,
      errorCode: "PROVIDER_NOT_CONFIGURED",
    };
  }
}
