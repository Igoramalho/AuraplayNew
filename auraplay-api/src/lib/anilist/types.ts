export type AniListSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export interface AniListFuzzyDate { year: number | null; month: number | null; day: number | null; }
export interface AniListTitle { romaji: string | null; english: string | null; native: string | null; }
export interface AniListRelationEdge { relationType: string; node: { id: number; idMal: number | null; format: string | null; title: AniListTitle } }

export interface AniListMedia {
  id: number;
  idMal: number | null;
  title: AniListTitle;
  synonyms: string[];
  description: string | null;
  coverImage: { extraLarge: string | null; large: string | null; color: string | null };
  bannerImage: string | null;
  averageScore: number | null;
  popularity: number | null;
  trending: number | null;
  genres: string[];
  format: string | null;
  status: string | null;
  season: AniListSeason | null;
  seasonYear: number | null;
  startDate: AniListFuzzyDate;
  endDate: AniListFuzzyDate;
  episodes: number | null;
  duration: number | null;
  countryOfOrigin: string | null;
  isAdult: boolean;
  relations: { edges: AniListRelationEdge[] };
  nextAiringEpisode: { episode: number; airingAt: number } | null;
}

export interface AniListHomeCatalog {
  featured: AniListMedia[];
  popularSeason: AniListMedia[];
  recentReleases: AniListMedia[];
  airingNow: AniListMedia[];
}

export interface AniListSearchResult {
  items: AniListMedia[];
  page: number;
  limit: number;
  total: number;
  hasNextPage: boolean;
}
