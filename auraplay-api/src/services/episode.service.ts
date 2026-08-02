import type { AnimeRepository } from "@/lib/supabase/repositories/anime.repository";
import type { EpisodeRepository } from "@/lib/supabase/repositories/episode.repository";
import type { EpisodeRow, EpisodeSourceRow, SeasonRow } from "@/lib/supabase/database.types";
import type { animeIdentifierSchema } from "@/schemas/anime.schema";
import type { z } from "zod";

import { ApiHttpError } from "@/lib/http/response";
import { parseProviderOrder } from "@/lib/provider/factory";
import { projectCanonicalEpisodes, projectCanonicalSeasons } from "@/services/public-season-projection";

type AnimeLookupPort = Pick<AnimeRepository, "findById" | "findByAnilistId">;
type EpisodeReadPort = Pick<EpisodeRepository, "listSeasons" | "listEpisodes" | "listAvailableSources">;
type AnimeIdentifier = z.infer<typeof animeIdentifierSchema>;

export class EpisodeService {
  constructor(private readonly anime: AnimeLookupPort, private readonly episodes: EpisodeReadPort) {}

  async getEpisodes(identifier: AnimeIdentifier) {
    const anime = identifier.kind === "internal" ? await this.anime.findById(identifier.value) : await this.anime.findByAnilistId(identifier.value);
    if (!anime) throw new ApiHttpError(404, "ANIME_NOT_FOUND", "Anime não encontrado.");
    const [seasons, episodes] = await Promise.all([this.episodes.listSeasons(anime.id), this.episodes.listEpisodes(anime.id)]);
    const providerOrder = parseProviderOrder();
    const seasonById = new Map(seasons.map((season) => [season.id, season]));
    const candidates = await Promise.all(episodes.map(async (episode) => ({
      episode,
      season: seasonById.get(episode.season_id),
      sources: await this.episodes.listAvailableSources(episode.id),
    })));
    const resultSeasons = projectCanonicalSeasons(seasons, providerOrder).map((group) => {
      const validCandidates: Array<{ episode: EpisodeRow; season: SeasonRow; sources: EpisodeSourceRow[] }> = candidates
        .filter((candidate): candidate is { episode: EpisodeRow; season: SeasonRow; sources: EpisodeSourceRow[] } => candidate.season !== undefined);
      return {
        id: group.preferred.id,
        number: group.number,
        title: group.title,
        episodes: projectCanonicalEpisodes(group, validCandidates, providerOrder).map(({ episode, sources }) => {
          const audioTypes = [...new Set(sources.map((source) => source.audio_type))];
          return {
            id: episode.id, number: episode.episode_number, title: episode.title,
            durationSeconds: episode.duration_seconds, thumbnailUrl: episode.thumbnail_url,
            audioType: audioTypes.length > 1 ? "MULTI" : audioTypes[0] ?? null,
            available: episode.available && sources.length > 0,
          };
        }),
      };
    });
    return { animeId: anime.id, playbackStatus: anime.playback_status, seasons: resultSeasons };
  }
}
