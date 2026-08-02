import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, EpisodeRow, EpisodeSourceRow, SeasonRow } from "@/lib/supabase/database.types";
import { throwRepositoryError } from "./repository-error";

export class EpisodeRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listSeasons(animeId: string): Promise<SeasonRow[]> {
    const { data, error } = await this.db.from("seasons").select("*").eq("anime_id", animeId).order("display_order").order("season_number");
    if (error) throwRepositoryError("episode.listSeasons", error);
    return data;
  }

  async listEpisodes(animeId: string): Promise<EpisodeRow[]> {
    const { data, error } = await this.db.from("episodes").select("*").eq("anime_id", animeId).order("episode_number");
    if (error) throwRepositoryError("episode.listEpisodes", error);
    return data;
  }

  async findAvailableEpisode(id: string): Promise<EpisodeRow | null> {
    const { data, error } = await this.db.from("episodes").select("*").eq("id", id).eq("available", true).maybeSingle();
    if (error) throwRepositoryError("episode.findAvailableEpisode", error);
    return data;
  }

  async listAvailableSources(episodeId: string): Promise<EpisodeSourceRow[]> {
    const { data, error } = await this.db.from("episode_sources").select("*").eq("episode_id", episodeId).eq("available", true);
    if (error) throwRepositoryError("episode.listAvailableSources", error);
    return data;
  }

  async getPlaybackContext(episodeId: string): Promise<{ episode: EpisodeRow; season: SeasonRow; sources: EpisodeSourceRow[] } | null> {
    const episode = await this.findAvailableEpisode(episodeId);
    if (!episode) return null;
    const { data: season, error } = await this.db.from("seasons").select("*").eq("id", episode.season_id).maybeSingle();
    if (error) throwRepositoryError("episode.getPlaybackContext.season", error);
    if (!season) return null;
    const sources = await this.listAvailableSources(episode.id);
    return { episode, season, sources };
  }
}
