import type { Anime } from "@/types/anime";

export const CATALOG_SECTION_KEYS = ["featured", "popularSeason", "recentReleases", "airingNow"] as const;
export type CatalogSectionKey = (typeof CATALOG_SECTION_KEYS)[number];

export interface CatalogSection {
  key: CatalogSectionKey;
  title: string;
  updatedAt: string;
  entries: Anime[];
}
