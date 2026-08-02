import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnimeRelationRow, AnimeRow, AnimeTitleRow, Database } from "@/lib/supabase/database.types";
import { throwRepositoryError } from "./repository-error";

export type AnimeUpsert = Database["public"]["Tables"]["animes"]["Insert"];
export type AnimeTitleInsert = Database["public"]["Tables"]["anime_titles"]["Insert"];
export type AnimeRelationInsert = Database["public"]["Tables"]["anime_relations"]["Insert"];

export class AnimeRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findById(id: string): Promise<AnimeRow | null> {
    const { data, error } = await this.db.from("animes").select("*").eq("id", id).maybeSingle();
    if (error) throwRepositoryError("anime.findById", error);
    return data;
  }

  async findByAnilistId(anilistId: number): Promise<AnimeRow | null> {
    const { data, error } = await this.db.from("animes").select("*").eq("anilist_id", anilistId).maybeSingle();
    if (error) throwRepositoryError("anime.findByAnilistId", error);
    return data;
  }

  async listTitles(animeId: string): Promise<AnimeTitleRow[]> {
    const { data, error } = await this.db.from("anime_titles").select("*").eq("anime_id", animeId).order("title_type").order("title");
    if (error) throwRepositoryError("anime.listTitles", error);
    return data;
  }

  async listRelations(animeId: string): Promise<AnimeRelationRow[]> {
    const { data, error } = await this.db.from("anime_relations").select("*").eq("anime_id", animeId).order("relation_type").order("related_anilist_id");
    if (error) throwRepositoryError("anime.listRelations", error);
    return data;
  }

  async upsert(input: AnimeUpsert): Promise<AnimeRow> {
    const { data, error } = await this.db.from("animes").upsert(input, { onConflict: "anilist_id" }).select().single();
    if (error) throwRepositoryError("anime.upsert", error);
    return data;
  }

  async upsertTitles(titles: AnimeTitleInsert[]): Promise<AnimeTitleRow[]> {
    if (titles.length === 0) return [];
    const { data, error } = await this.db.from("anime_titles").upsert(titles, {
      onConflict: "anime_id,normalized_title,language,title_type",
    }).select();
    if (error) throwRepositoryError("anime.upsertTitles", error);
    return data;
  }

  async upsertRelations(relations: AnimeRelationInsert[]): Promise<AnimeRelationRow[]> {
    if (relations.length === 0) return [];
    const { data, error } = await this.db.from("anime_relations").upsert(relations, {
      onConflict: "anime_id,related_anilist_id,relation_type",
    }).select();
    if (error) throwRepositoryError("anime.upsertRelations", error);
    return data;
  }

  async search(query: string, page: number, limit: number): Promise<AnimeRow[]> {
    const { data, error } = await this.db.rpc("search_animes", {
      p_query: query,
      p_limit: limit,
      p_offset: (page - 1) * limit,
    });
    if (error) throwRepositoryError("anime.search", error);
    return data;
  }
}
