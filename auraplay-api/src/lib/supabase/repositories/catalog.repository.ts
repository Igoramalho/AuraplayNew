import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnimeRow, CatalogEntryRow, CatalogSectionRow, Database } from "@/lib/supabase/database.types";
import { throwRepositoryError } from "./repository-error";

export class CatalogRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async listSections(): Promise<CatalogSectionRow[]> {
    const { data, error } = await this.db.from("catalog_sections").select("*").order("key");
    if (error) throwRepositoryError("catalog.listSections", error);
    return data;
  }

  async listSectionEntriesWithAnime(sectionId: string): Promise<Array<{ entry: CatalogEntryRow; anime: AnimeRow }>> {
    const { data: entries, error: entriesError } = await this.db.from("catalog_entries").select("*").eq("section_id", sectionId).order("position");
    if (entriesError) throwRepositoryError("catalog.listSectionEntries", entriesError);
    if (entries.length === 0) return [];

    const { data: animes, error: animesError } = await this.db.from("animes").select("*").in("id", entries.map((entry) => entry.anime_id));
    if (animesError) throwRepositoryError("catalog.listSectionEntries.animes", animesError);
    const byId = new Map(animes.map((anime) => [anime.id, anime]));
    return entries.flatMap((entry) => {
      const anime = byId.get(entry.anime_id);
      return anime ? [{ entry, anime }] : [];
    });
  }

  async upsertSection(key: string, title: string): Promise<CatalogSectionRow> {
    const { data, error } = await this.db.from("catalog_sections").upsert({ key, title }, { onConflict: "key" }).select().single();
    if (error) throwRepositoryError("catalog.upsertSection", error);
    return data;
  }

  async replaceEntries(sectionId: string, entries: Array<Pick<CatalogEntryRow, "anime_id" | "position" | "score">>): Promise<void> {
    const { error: deleteError } = await this.db.from("catalog_entries").delete().eq("section_id", sectionId);
    if (deleteError) throwRepositoryError("catalog.replaceEntries.delete", deleteError);
    if (entries.length === 0) return;

    const { error } = await this.db.from("catalog_entries").upsert(
      entries.map((entry) => ({ ...entry, section_id: sectionId })),
      { onConflict: "section_id,anime_id" },
    );
    if (error) throwRepositoryError("catalog.replaceEntries.upsert", error);
  }
}
