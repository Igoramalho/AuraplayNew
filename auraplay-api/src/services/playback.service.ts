import type { EpisodeProvider } from "@/lib/provider/interface";
import { ProviderChain } from "../lib/provider/provider-chain";
import type { EpisodeRepository } from "@/lib/supabase/repositories/episode.repository";

import { ApiHttpError } from "../lib/http/response";

type PlaybackReadPort = Pick<EpisodeRepository, "getPlaybackContext">;

export class PlaybackService {
  private readonly providers: ProviderChain;

  constructor(private readonly episodes: PlaybackReadPort, provider: EpisodeProvider | ProviderChain) {
    this.providers = provider instanceof ProviderChain ? provider : new ProviderChain([provider]);
  }

  async getPlayback(episodeId: string) {
    const context = await this.episodes.getPlaybackContext(episodeId);
    if (!context) throw new ApiHttpError(404, "EPISODE_NOT_FOUND", "Episódio não encontrado ou indisponível.");
    const source = context.sources.find((item) => item.provider_key === context.season.provider_key);
    if (!source) throw new ApiHttpError(409, "PLAYBACK_UNAVAILABLE", "Nenhuma fonte reproduzível disponível.");
    const provider = this.providers.get(source.provider_key);
    if (!provider) throw new ApiHttpError(503, "PROVIDER_NOT_CONFIGURED", "Provider da fonte não configurado.");
    return provider.getPlayback({
      providerKey: source.provider_key,
      providerAnimeId: context.season.provider_anime_id,
      providerSeasonId: context.season.provider_season_id,
      providerEpisodeId: context.episode.provider_episode_id,
      providerSourceId: source.provider_source_id,
    });
  }
}
