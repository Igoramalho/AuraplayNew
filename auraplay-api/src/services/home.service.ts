import type { CatalogRepository } from "@/lib/supabase/repositories/catalog.repository";
import { mapAnimeCard } from "@/services/api-mapper";

type CatalogReadPort = Pick<CatalogRepository, "listSections" | "listSectionEntriesWithAnime">;

export class HomeService {
  constructor(private readonly catalog: CatalogReadPort, private readonly now: () => number = Date.now) {}

  async getHome() {
    const sections = await this.catalog.listSections();
    const byKey = new Map<string, ReturnType<typeof mapAnimeCard>[]>();
    await Promise.all(sections.map(async (section) => {
      const entries = await this.catalog.listSectionEntriesWithAnime(section.id);
      byKey.set(section.key, entries.map(({ anime }) => mapAnimeCard(anime)));
    }));
    const timestamps = sections.map((section) => Date.parse(section.updated_at)).filter(Number.isFinite);
    const updatedAtMs = timestamps.length > 0 ? Math.max(...timestamps) : null;
    return {
      featured: byKey.get("featured") ?? [],
      popularSeason: byKey.get("popularSeason") ?? [],
      recentReleases: byKey.get("recentReleases") ?? [],
      updatedAt: updatedAtMs === null ? null : new Date(updatedAtMs).toISOString(),
      stale: updatedAtMs === null || this.now() - updatedAtMs > 30 * 60 * 1_000,
    };
  }
}
