import { describe, expect, it } from "vitest";

import { deduplicateByAnilistId } from "./deduplicate";
import { mapAniListAnime, mapAniListRelations, mapAniListTitles, normalizeTitle } from "./mapper";
import type { AniListMedia } from "./types";

function media(overrides: Partial<AniListMedia> = {}): AniListMedia {
  return {
    id: 1, idMal: 2, title: { romaji: "Sousou no Frieren", english: "Frieren: Beyond Journey's End", native: "葬送のフリーレン" },
    synonyms: ["Frieren e a Jornada para o Além"], description: "Descrição", coverImage: { extraLarge: "https://img.test/cover.jpg", large: null, color: null },
    bannerImage: null, averageScore: 90, popularity: 100, trending: 50, genres: ["Adventure"], format: "TV", status: "FINISHED",
    season: "FALL", seasonYear: 2023, startDate: { year: 2023, month: 9, day: 29 }, endDate: { year: 2024, month: 3, day: 22 },
    episodes: 28, duration: 24, countryOfOrigin: "JP", isAdult: false,
    relations: { edges: [{ relationType: "SEQUEL", node: { id: 2, idMal: 3, format: "TV", title: { romaji: "Sequel", english: null, native: null } } }] },
    nextAiringEpisode: null, ...overrides,
  };
}

describe("AniList mapper", () => {
  it("normaliza acentos, caixa, pontuação e espaços", () => {
    expect(normalizeTitle("  Friéren:  Além!  ")).toBe("frieren alem");
  });

  it("mapeia metadados sem transformar contagem prevista em inventário disponível", () => {
    const mapped = mapAniListAnime(media());
    expect(mapped).toMatchObject({ anilist_id: 1, mal_id: 2, expected_episode_count: 28, preferred_title: "Frieren: Beyond Journey's End" });
    expect(mapped.available_episode_count).toBeUndefined();
  });

  it("preserva aliases e relações por AniList ID", () => {
    expect(mapAniListTitles(media(), "anime-uuid")).toHaveLength(4);
    expect(mapAniListRelations(media(), "anime-uuid")).toEqual([{ anime_id: "anime-uuid", related_anilist_id: 2, relation_type: "SEQUEL" }]);
  });

  it("remove duplicados somente pelo AniList ID", () => {
    expect(deduplicateByAnilistId([media(), media(), media({ id: 2 })]).map((item) => item.id)).toEqual([1, 2]);
  });
});
