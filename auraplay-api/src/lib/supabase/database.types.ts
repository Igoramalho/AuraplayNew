import type { MatchStatus, PlaybackStatus, SyncJobStatus } from "@/constants/sync-status";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface AnimeRow extends Record<string, unknown> {
  id: string; anilist_id: number; mal_id: number | null; title_romaji: string | null;
  title_english: string | null; title_native: string | null; preferred_title: string;
  description: string | null; cover_url: string | null; banner_url: string | null;
  average_score: number | null; popularity: number | null; trending: number | null;
  genres: string[]; format: string | null; status: string | null; season: string | null;
  season_year: number | null; start_date: string | null; end_date: string | null;
  expected_episode_count: number | null; available_episode_count: number;
  playback_status: PlaybackStatus; next_airing_episode: number | null;
  next_airing_at: string | null; last_metadata_sync_at: string | null;
  created_at: string; updated_at: string;
}

export interface AnimeTitleRow extends Record<string, unknown> { id: string; anime_id: string; title: string; normalized_title: string; language: string; title_type: string; created_at: string; }
export interface AnimeRelationRow extends Record<string, unknown> { id: string; anime_id: string; related_anilist_id: number; relation_type: string; created_at: string; }
export interface CatalogSectionRow extends Record<string, unknown> { id: string; key: string; title: string; updated_at: string; }
export interface CatalogEntryRow extends Record<string, unknown> { section_id: string; anime_id: string; position: number; score: number | null; updated_at: string; }
export interface ProviderAnimeRow extends Record<string, unknown> { id: string; anime_id: string | null; provider_key: string; provider_anime_id: string; provider_title: string; match_status: MatchStatus; match_confidence: number | null; match_method: string | null; last_sync_at: string | null; created_at: string; updated_at: string; }
export interface SeasonRow extends Record<string, unknown> { id: string; anime_id: string; provider_key: string; provider_anime_id: string; provider_season_id: string; season_number: number; title: string | null; display_order: number; created_at: string; updated_at: string; }
export interface EpisodeRow extends Record<string, unknown> { id: string; anime_id: string; season_id: string; provider_episode_id: string; episode_number: number; absolute_number: number | null; title: string | null; description: string | null; duration_seconds: number | null; thumbnail_url: string | null; aired_at: string | null; available: boolean; created_at: string; updated_at: string; }
export interface EpisodeSourceRow extends Record<string, unknown> { id: string; episode_id: string; provider_key: string; provider_source_id: string; language: string | null; audio_type: "SUB" | "DUB" | "MULTI"; quality: string | null; available: boolean; last_checked_at: string | null; created_at: string; updated_at: string; }
export interface SyncJobRow extends Record<string, unknown> { id: string; job_type: string; status: SyncJobStatus; started_at: string; finished_at: string | null; processed_count: number; created_count: number; updated_count: number; skipped_count: number; error_count: number; error_summary: string | null; metadata: Json; }
export interface SyncLockRow extends Record<string, unknown> { lock_key: string; acquired_at: string; expires_at: string; owner_id: string; }

type Table<Row, Insert = Partial<Row>, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      animes: Table<AnimeRow, Partial<AnimeRow> & Pick<AnimeRow, "anilist_id" | "preferred_title">>;
      anime_titles: Table<AnimeTitleRow, Partial<AnimeTitleRow> & Pick<AnimeTitleRow, "anime_id" | "title" | "normalized_title" | "language" | "title_type">>;
      anime_relations: Table<AnimeRelationRow, Partial<AnimeRelationRow> & Pick<AnimeRelationRow, "anime_id" | "related_anilist_id" | "relation_type">>;
      catalog_sections: Table<CatalogSectionRow, Partial<CatalogSectionRow> & Pick<CatalogSectionRow, "key" | "title">>;
      catalog_entries: Table<CatalogEntryRow, Partial<CatalogEntryRow> & Pick<CatalogEntryRow, "section_id" | "anime_id" | "position">>;
      provider_animes: Table<ProviderAnimeRow, Partial<ProviderAnimeRow> & Pick<ProviderAnimeRow, "provider_key" | "provider_anime_id" | "provider_title">>;
      seasons: Table<SeasonRow, Partial<SeasonRow> & Pick<SeasonRow, "anime_id" | "provider_key" | "provider_anime_id" | "provider_season_id" | "season_number">>;
      episodes: Table<EpisodeRow, Partial<EpisodeRow> & Pick<EpisodeRow, "anime_id" | "season_id" | "provider_episode_id" | "episode_number">>;
      episode_sources: Table<EpisodeSourceRow, Partial<EpisodeSourceRow> & Pick<EpisodeSourceRow, "episode_id" | "provider_key" | "provider_source_id">>;
      sync_jobs: Table<SyncJobRow, Partial<SyncJobRow> & Pick<SyncJobRow, "job_type">>;
      sync_locks: Table<SyncLockRow, SyncLockRow>;
    };
    Views: Record<string, never>;
    Functions: {
      acquire_sync_lock: { Args: { p_lock_key: string; p_owner_id: string; p_ttl_seconds?: number }; Returns: boolean };
      release_sync_lock: { Args: { p_lock_key: string; p_owner_id: string }; Returns: boolean };
      search_animes: { Args: { p_query: string; p_limit: number; p_offset: number }; Returns: AnimeRow[] };
    };
    Enums: {
      playback_status: PlaybackStatus;
      match_status: MatchStatus;
      sync_job_status: SyncJobStatus;
      audio_type: "SUB" | "DUB" | "MULTI";
    };
    CompositeTypes: Record<string, never>;
  };
}
