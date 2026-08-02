import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  AnimeRow,
  Database,
  EpisodeRow,
  EpisodeSourceRow,
  ProviderAnimeRow,
  SeasonRow,
} from "@/lib/supabase/database.types";
import { throwRepositoryError } from "./repository-error";

export type ProviderAnimeUpsert = Database["public"]["Tables"]["provider_animes"]["Insert"];
export type SeasonUpsert = Database["public"]["Tables"]["seasons"]["Insert"];
export type EpisodeUpsert = Database["public"]["Tables"]["episodes"]["Insert"];
export type EpisodeSourceUpsert = Database["public"]["Tables"]["episode_sources"]["Insert"];

export class ProviderPersistenceRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findProviderAnime(providerKey: string, providerAnimeId: string): Promise<ProviderAnimeRow | null> {
    const { data, error } = await this.db.from("provider_animes").select("*")
      .eq("provider_key", providerKey).eq("provider_anime_id", providerAnimeId).maybeSingle();
    if (error) throwRepositoryError("providerPersistence.findProviderAnime", error);
    return data;
  }

  async findProviderAnimeByAnimeId(providerKey: string, animeId: string): Promise<ProviderAnimeRow | null> {
    const { data, error } = await this.db.from("provider_animes").select("*")
      .eq("provider_key", providerKey).eq("anime_id", animeId).maybeSingle();
    if (error) throwRepositoryError("providerPersistence.findProviderAnimeByAnimeId", error);
    return data;
  }

  async findAnimeByAnilistId(id: number): Promise<AnimeRow | null> {
    const { data, error } = await this.db.from("animes").select("*").eq("anilist_id", id).maybeSingle();
    if (error) throwRepositoryError("providerPersistence.findAnimeByAnilistId", error);
    return data;
  }

  async findAnimeByMalId(id: number): Promise<AnimeRow | null> {
    const { data, error } = await this.db.from("animes").select("*").eq("mal_id", id).maybeSingle();
    if (error) throwRepositoryError("providerPersistence.findAnimeByMalId", error);
    return data;
  }

  async findAnimeCandidates(normalizedTitles: string[]): Promise<AnimeRow[]> {
    if (normalizedTitles.length === 0) return [];
    const { data: titles, error: titleError } = await this.db.from("anime_titles").select("anime_id")
      .in("normalized_title", normalizedTitles);
    if (titleError) throwRepositoryError("providerPersistence.findAnimeCandidates.titles", titleError);
    const animeIds = [...new Set(titles.map((item) => item.anime_id))];
    if (animeIds.length === 0) return [];
    const { data, error } = await this.db.from("animes").select("*").in("id", animeIds);
    if (error) throwRepositoryError("providerPersistence.findAnimeCandidates.animes", error);
    return data;
  }

  async upsertProviderAnime(input: ProviderAnimeUpsert): Promise<ProviderAnimeRow> {
    const { data, error } = await this.db.from("provider_animes").upsert(input, {
      onConflict: "provider_key,provider_anime_id",
    }).select().single();
    if (error) throwRepositoryError("providerPersistence.upsertProviderAnime", error);
    return data;
  }

  async findSeason(providerKey: string, providerAnimeId: string, providerSeasonId: string): Promise<SeasonRow | null> {
    const { data, error } = await this.db.from("seasons").select("*")
      .eq("provider_key", providerKey).eq("provider_anime_id", providerAnimeId)
      .eq("provider_season_id", providerSeasonId).maybeSingle();
    if (error) throwRepositoryError("providerPersistence.findSeason", error);
    return data;
  }

  async upsertSeason(input: SeasonUpsert): Promise<SeasonRow> {
    const { data, error } = await this.db.from("seasons").upsert(input, {
      onConflict: "provider_key,provider_anime_id,provider_season_id",
    }).select().single();
    if (error) throwRepositoryError("providerPersistence.upsertSeason", error);
    return data;
  }

  async findEpisode(seasonId: string, providerEpisodeId: string): Promise<EpisodeRow | null> {
    const { data, error } = await this.db.from("episodes").select("*")
      .eq("season_id", seasonId).eq("provider_episode_id", providerEpisodeId).maybeSingle();
    if (error) throwRepositoryError("providerPersistence.findEpisode", error);
    return data;
  }

  async upsertEpisode(input: EpisodeUpsert): Promise<EpisodeRow> {
    const { data, error } = await this.db.from("episodes").upsert(input, {
      onConflict: "season_id,provider_episode_id",
    }).select().single();
    if (error) throwRepositoryError("providerPersistence.upsertEpisode", error);
    return data;
  }

  async findEpisodeSource(episodeId: string, providerKey: string, providerSourceId: string, audioType: "SUB" | "DUB" | "MULTI"): Promise<EpisodeSourceRow | null> {
    const { data, error } = await this.db.from("episode_sources").select("*")
      .eq("episode_id", episodeId).eq("provider_key", providerKey)
      .eq("provider_source_id", providerSourceId).eq("audio_type", audioType).maybeSingle();
    if (error) throwRepositoryError("providerPersistence.findEpisodeSource", error);
    return data;
  }

  async upsertEpisodeSource(input: EpisodeSourceUpsert): Promise<EpisodeSourceRow> {
    const { data, error } = await this.db.from("episode_sources").upsert(input, {
      onConflict: "episode_id,provider_key,provider_source_id,audio_type",
    }).select().single();
    if (error) throwRepositoryError("providerPersistence.upsertEpisodeSource", error);
    return data;
  }
}
