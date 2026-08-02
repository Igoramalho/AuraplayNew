import { describe, expect, it, vi } from "vitest";

import type { AniListMedia } from "@/lib/anilist/types";
import type { AnimeRepository } from "@/lib/supabase/repositories/anime.repository";
import { AnimeMetadataService } from "./anime-metadata.service";

const naruto: AniListMedia = {
  id: 20,
  idMal: 20,
  title: { romaji: "Naruto", english: "Naruto", native: "ナルト" },
  synonyms: ["NARUTO"],
  description: "Canonical metadata",
  coverImage: { extraLarge: "https://example.test/naruto.jpg", large: null, color: null },
  bannerImage: null,
  averageScore: 80,
  popularity: 1,
  trending: 1,
  genres: ["Action"],
  format: "TV",
  status: "FINISHED",
  season: "FALL",
  seasonYear: 2002,
  startDate: { year: 2002, month: 10, day: 3 },
  endDate: { year: 2007, month: 2, day: 8 },
  episodes: 220,
  duration: 23,
  countryOfOrigin: "JP",
  isAdult: false,
  relations: { edges: [] },
  nextAiringEpisode: null,
};

describe("AnimeMetadataService", () => {
  it("reutiliza o upsert por AniList ID em execuções repetidas", async () => {
    let exists = false;
    const row = { id: "anime-20", anilist_id: 20 };
    const repository = {
      findByAnilistId: vi.fn(async () => (exists ? row : null)),
      upsert: vi.fn(async () => { exists = true; return row; }),
      upsertTitles: vi.fn(async (items: unknown[]) => items),
      upsertRelations: vi.fn(async (items: unknown[]) => items),
    } as unknown as AnimeRepository;
    const service = new AnimeMetadataService(repository);

    expect(await service.persist(naruto)).toMatchObject({ animeId: "anime-20", operation: "created" });
    expect(await service.persist(naruto)).toMatchObject({ animeId: "anime-20", operation: "updated" });
    expect(repository.upsert).toHaveBeenCalledTimes(2);
  });
});
