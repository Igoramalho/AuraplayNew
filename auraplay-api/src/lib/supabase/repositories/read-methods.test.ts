import { describe, expect, it, vi } from "vitest";

import type { AnimeRelationRow, AnimeRow, AnimeTitleRow, CatalogEntryRow, EpisodeRow, EpisodeSourceRow, SeasonRow } from "../database.types";
import { AnimeRepository } from "./anime.repository";
import { CatalogRepository } from "./catalog.repository";
import { EpisodeRepository } from "./episode.repository";

function queryResult<T>(data: T) {
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn(() => query), order: vi.fn(() => query), maybeSingle: vi.fn(() => query),
    then(resolve: (value: { data: T; error: null }) => unknown) { return Promise.resolve(resolve({ data, error: null })); },
  };
  return query;
}

describe("extensões de leitura dos repositories", () => {
  it("lista entradas com anime preservando a ordem por position", async () => {
    const entries = [
      { section_id: "s", anime_id: "a2", position: 0, score: null, updated_at: "now" },
      { section_id: "s", anime_id: "a1", position: 1, score: null, updated_at: "now" },
    ] as CatalogEntryRow[];
    const animes = [{ id: "a1", preferred_title: "One" }, { id: "a2", preferred_title: "Two" }] as AnimeRow[];
    const entriesQuery = queryResult(entries);
    const animesQuery = queryResult(animes);
    const db = { from: vi.fn((table: string) => table === "catalog_entries" ? entriesQuery : animesQuery) };
    const result = await new CatalogRepository(db as never).listSectionEntriesWithAnime("s");
    expect(entriesQuery.order).toHaveBeenCalledWith("position");
    expect(result.map(({ anime }) => anime.id)).toEqual(["a2", "a1"]);
  });

  it("lista títulos e relações sem escrita", async () => {
    const titles = [{ id: "t", anime_id: "a", title: "Anime", normalized_title: "anime", language: "und", title_type: "SYNONYM", created_at: "now" }] as AnimeTitleRow[];
    const relations = [{ id: "r", anime_id: "a", related_anilist_id: 2, relation_type: "SEQUEL", created_at: "now" }] as AnimeRelationRow[];
    const db = { from: vi.fn((table: string) => queryResult(table === "anime_titles" ? titles : relations)) };
    const repository = new AnimeRepository(db as never);
    await expect(repository.listTitles("a")).resolves.toBe(titles);
    await expect(repository.listRelations("a")).resolves.toBe(relations);
    expect(db.from).toHaveBeenCalledTimes(2);
  });

  it("consolida episódio disponível, temporada e fontes", async () => {
    const episode = { id: "e", season_id: "s" } as EpisodeRow;
    const season = { id: "s" } as SeasonRow;
    const sources = [{ id: "src" }] as EpisodeSourceRow[];
    const db = { from: vi.fn(() => queryResult(season)) };
    const repository = new EpisodeRepository(db as never);
    vi.spyOn(repository, "findAvailableEpisode").mockResolvedValue(episode);
    vi.spyOn(repository, "listAvailableSources").mockResolvedValue(sources);
    await expect(repository.getPlaybackContext("e")).resolves.toEqual({ episode, season, sources });
  });
});
