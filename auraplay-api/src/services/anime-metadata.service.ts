import { mapAniListAnime, mapAniListRelations, mapAniListTitles } from "../lib/anilist/mapper";
import type { AniListMedia } from "../lib/anilist/types";
import type { AnimeRepository } from "../lib/supabase/repositories/anime.repository";

export interface AnimeMetadataPersistenceResult {
  animeId: string;
  operation: "created" | "updated";
  titlesPersisted: number;
  relationsPersisted: number;
}

export class AnimeMetadataService {
  constructor(private readonly animeRepository: AnimeRepository) {}

  async persist(media: AniListMedia): Promise<AnimeMetadataPersistenceResult> {
    const existing = await this.animeRepository.findByAnilistId(media.id);
    const anime = await this.animeRepository.upsert(mapAniListAnime(media));
    const [titles, relations] = await Promise.all([
      this.animeRepository.upsertTitles(mapAniListTitles(media, anime.id)),
      this.animeRepository.upsertRelations(mapAniListRelations(media, anime.id)),
    ]);
    return {
      animeId: anime.id,
      operation: existing ? "updated" : "created",
      titlesPersisted: titles.length,
      relationsPersisted: relations.length,
    };
  }
}
