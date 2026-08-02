export type AudioType = "SUB" | "DUB" | "RAW" | "MULTI";

export interface EpisodeSource {
  id: string;
  providerKey: string;
  providerSourceId: string;
  language: string | null;
  audioType: AudioType;
  quality: string | null;
  available: boolean;
}

export interface Episode {
  id: string;
  animeId: string;
  seasonId: string;
  providerEpisodeId: string;
  episodeNumber: number;
  absoluteNumber: number | null;
  title: string | null;
  description: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  airedAt: string | null;
  available: boolean;
  sources?: EpisodeSource[];
}

export interface Season {
  id: string;
  animeId: string;
  providerKey: string;
  providerAnimeId: string;
  providerSeasonId: string;
  seasonNumber: number;
  title: string | null;
  displayOrder: number;
  episodes?: Episode[];
}
