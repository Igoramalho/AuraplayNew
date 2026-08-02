import type { PlaybackStatus } from "@/constants/sync-status";

export interface AnimeTitle {
  title: string;
  normalizedTitle: string;
  language: string;
  titleType: "ROMAJI" | "ENGLISH" | "NATIVE" | "PORTUGUESE" | "SYNONYM";
}

export interface AnimeRelation {
  relatedAnilistId: number;
  relationType: string;
}

export interface Anime {
  id: string;
  anilistId: number;
  malId: number | null;
  titleRomaji: string | null;
  titleEnglish: string | null;
  titleNative: string | null;
  preferredTitle: string;
  description: string | null;
  coverUrl: string | null;
  bannerUrl: string | null;
  averageScore: number | null;
  popularity: number | null;
  trending: number | null;
  genres: string[];
  format: string | null;
  status: string | null;
  season: string | null;
  seasonYear: number | null;
  expectedEpisodeCount: number | null;
  availableEpisodeCount: number;
  playbackStatus: PlaybackStatus;
  lastMetadataSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}
