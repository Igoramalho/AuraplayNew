import pLimit from "p-limit";

import { AniListClient } from "@/lib/anilist/client";
import { deduplicateByAnilistId } from "@/lib/anilist/deduplicate";
import { mapAniListAnime, mapAniListRelations, mapAniListTitles } from "@/lib/anilist/mapper";
import type { AniListHomeCatalog, AniListMedia } from "@/lib/anilist/types";
import type { AnimeRepository } from "@/lib/supabase/repositories/anime.repository";
import type { CatalogRepository } from "@/lib/supabase/repositories/catalog.repository";
import { createRepositories } from "@/lib/supabase/repositories";
import type { CatalogSectionKey } from "@/types/catalog";

const SECTION_TITLES: Record<CatalogSectionKey, string> = {
  featured: "Destaques",
  popularSeason: "Populares da temporada",
  recentReleases: "Lançamentos recentes",
  airingNow: "Em exibição",
};

export interface CatalogSyncResult {
  processed: number;
  createdOrUpdated: number;
  sections: Record<CatalogSectionKey, number>;
  updatedAt: string;
}

export class CatalogService {
  constructor(
    private readonly aniList: AniListClient,
    private readonly animeRepository: AnimeRepository,
    private readonly catalogRepository: CatalogRepository,
  ) {}

  static create(): CatalogService {
    const repositories = createRepositories();
    return new CatalogService(new AniListClient(), repositories.anime, repositories.catalog);
  }

  async syncHomeCatalog(perPage = 20): Promise<CatalogSyncResult> {
    const catalog = await this.aniList.getHomeCatalog(perPage);
    const sections = this.normalizedSections(catalog);
    const allAnime = deduplicateByAnilistId(Object.values(sections).flat());
    const limit = pLimit(5);
    const storedPairs = await Promise.all(allAnime.map((media) => limit(async () => {
      const anime = await this.animeRepository.upsert(mapAniListAnime(media));
      await Promise.all([
        this.animeRepository.upsertTitles(mapAniListTitles(media, anime.id)),
        this.animeRepository.upsertRelations(mapAniListRelations(media, anime.id)),
      ]);
      return [media.id, anime.id] as const;
    })));
    const internalIds = new Map(storedPairs);

    for (const [key, items] of Object.entries(sections) as Array<[CatalogSectionKey, AniListMedia[]]>) {
      const section = await this.catalogRepository.upsertSection(key, SECTION_TITLES[key]);
      await this.catalogRepository.replaceEntries(section.id, items.map((media, position) => ({
        anime_id: internalIds.get(media.id)!, position, score: media.trending ?? media.popularity,
      })));
    }

    return {
      processed: Object.values(catalog).flat().length,
      createdOrUpdated: allAnime.length,
      sections: {
        featured: sections.featured.length,
        popularSeason: sections.popularSeason.length,
        recentReleases: sections.recentReleases.length,
        airingNow: sections.airingNow.length,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  private normalizedSections(catalog: AniListHomeCatalog): Record<CatalogSectionKey, AniListMedia[]> {
    return {
      featured: deduplicateByAnilistId(catalog.featured.filter((item) => !item.isAdult)),
      popularSeason: deduplicateByAnilistId(catalog.popularSeason.filter((item) => !item.isAdult)),
      recentReleases: deduplicateByAnilistId(catalog.recentReleases.filter((item) => !item.isAdult)),
      airingNow: deduplicateByAnilistId(catalog.airingNow.filter((item) => !item.isAdult)),
    };
  }
}
