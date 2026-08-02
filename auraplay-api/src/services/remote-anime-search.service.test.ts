import { describe, expect, it, vi } from "vitest";

import type { AniListMedia } from "../lib/anilist/types";
import { RemoteAnimeSearchService } from "./remote-anime-search.service";

function media(id: number, isAdult = false): AniListMedia {
  return {
    id, idMal: id, title: { english: `Anime ${id}`, romaji: `Anime ${id}`, native: null }, synonyms: [`Alias ${id}`],
    description: null, coverImage: { extraLarge: `https://img.test/${id}.jpg`, large: null, color: null }, bannerImage: null,
    averageScore: null, popularity: null, trending: null, genres: [], format: "TV", status: "FINISHED", season: null,
    seasonYear: 2024, startDate: { year: 2024, month: 1, day: 1 }, endDate: { year: 2024, month: 1, day: 2 },
    episodes: 12, duration: 24, countryOfOrigin: "JP", isAdult, relations: { edges: [] }, nextAiringEpisode: null,
  };
}

describe("RemoteAnimeSearchService", () => {
  it("normaliza resultados paginados e exclui conteúdo adulto sem persistência", async () => {
    const client = { searchAnime: vi.fn(async () => ({ items: [media(1), media(2, true)], page: 2, limit: 10, total: 22, hasNextPage: true })) };
    const result = await new RemoteAnimeSearchService(client as never).search({ q: "anime", page: 2, limit: 10 });
    expect(client.searchAnime).toHaveBeenCalledWith("anime", 2, 10);
    expect(result.items).toHaveLength(1);
    expect(result).toMatchObject({ page: 2, limit: 10, total: 22, hasNextPage: true });
    expect(result.items[0]).toMatchObject({ anilistId: 1, title: "Anime 1", normalizedTitle: "anime 1", expectedEpisodeCount: 12 });
  });
});
