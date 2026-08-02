import type { AnimeRepository } from "@/lib/supabase/repositories/anime.repository";
import type { EpisodeRepository } from "@/lib/supabase/repositories/episode.repository";
import type { animeIdentifierSchema } from "@/schemas/anime.schema";
import type { z } from "zod";

import { ApiHttpError } from "@/lib/http/response";
import { mapAnimeCard } from "@/services/api-mapper";
import { parseProviderOrder } from "@/lib/provider/factory";
import { projectCanonicalSeasons } from "@/services/public-season-projection";

type AnimeReadPort = Pick<AnimeRepository, "findById" | "findByAnilistId" | "listTitles" | "listRelations">;
type EpisodeReadPort = Pick<EpisodeRepository, "listSeasons">;
type AnimeIdentifier = z.infer<typeof animeIdentifierSchema>;

export class AnimeService {
  constructor(private readonly anime: AnimeReadPort, private readonly episodes: EpisodeReadPort) {}

  async getAnime(identifier: AnimeIdentifier) {
    const row = identifier.kind === "internal" ? await this.anime.findById(identifier.value) : await this.anime.findByAnilistId(identifier.value);
    if (!row) throw new ApiHttpError(404, "ANIME_NOT_FOUND", "Anime não encontrado.");
    const [titles, relations, seasons] = await Promise.all([
      this.anime.listTitles(row.id), this.anime.listRelations(row.id), this.episodes.listSeasons(row.id),
    ]);
    return {
      ...mapAnimeCard(row),
      description: row.description,
      genres: row.genres,
      format: row.format,
      titles: titles.map((title) => ({ title: title.title, language: title.language, type: title.title_type })),
      relations: relations.map((relation) => ({ anilistId: relation.related_anilist_id, type: relation.relation_type })),
      seasons: projectCanonicalSeasons(seasons, parseProviderOrder()).map(({ preferred, number, title }) => ({
        id: preferred.id, number, title, displayOrder: preferred.display_order,
      })),
      lastUpdatedAt: row.updated_at,
    };
  }
}
