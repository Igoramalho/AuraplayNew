import { describe, expect, it, vi } from "vitest";

import type { AniListMedia } from "../lib/anilist/types";
import type { EpisodeProvider } from "../lib/provider/interface";
import { ProviderChain } from "../lib/provider/provider-chain";
import type { ProviderAnimeMatch } from "../lib/provider/types";
import { AnimeDiscoveryService } from "./anime-discovery.service";

const animeRow = {
  id: "123e4567-e89b-42d3-a456-426614174000", anilist_id: 20, mal_id: 20, preferred_title: "Naruto",
  format: "TV", season_year: 2002, season: "FALL", expected_episode_count: 220,
};

function media(isAdult = false): AniListMedia {
  return {
    id: 20, idMal: 20, title: { english: "Naruto", romaji: "Naruto", native: null }, synonyms: [], description: null,
    coverImage: { extraLarge: null, large: null, color: null }, bannerImage: null, averageScore: null, popularity: null,
    trending: null, genres: [], format: "TV", status: "FINISHED", season: "FALL", seasonYear: 2002,
    startDate: { year: 2002, month: 10, day: 3 }, endDate: { year: null, month: null, day: null }, episodes: 220,
    duration: null, countryOfOrigin: "JP", isAdult, relations: { edges: [] }, nextAiringEpisode: null,
  };
}

function provider(key: string, ids: string[]): EpisodeProvider {
  const matches: ProviderAnimeMatch[] = ids.map((providerAnimeId) => ({
    providerKey: key, providerAnimeId, title: "Naruto", externalIds: {}, confidence: 0.5, matchMethod: "METADATA",
  }));
  return {
    key,
    findAnime: vi.fn(async () => matches),
    getAnimeDetails: vi.fn(async (reference) => ({
      providerKey: key, providerAnimeId: reference.providerAnimeId, title: "Naruto", alternativeTitles: [],
      externalIds: { anilistId: 20, malId: 20 }, format: "TV", year: 2002, available: true,
      description: null, coverUrl: null, episodeCount: 220, languages: [],
    })),
    getCatalog: vi.fn(), getSeasons: vi.fn(), getEpisodes: vi.fn(), getPlayback: vi.fn(), healthCheck: vi.fn(),
  } as unknown as EpisodeProvider;
}

function dependencies(providers: EpisodeProvider[]) {
  const aniList = { getAnimeById: vi.fn(async () => media()) };
  let imported = false;
  const metadata = { persist: vi.fn(async () => {
    const operation = imported ? "updated" as const : "created" as const;
    imported = true;
    return { animeId: animeRow.id, operation, titlesPersisted: 2, relationsPersisted: 1 };
  }) };
  const anime = { findById: vi.fn(async () => animeRow), listTitles: vi.fn(async () => [{ title: "Naruto" }]) };
  const associations = { findProviderAnimeByAnimeId: vi.fn(async (key: string) => key === "anikoto" ? {
    anime_id: animeRow.id, provider_key: key, provider_anime_id: "provider-a", match_status: "AUTO_MATCHED",
  } : null) };
  const catalogSink = { persist: vi.fn(async () => ({ created: 1, updated: 0, skipped: 0, needsReview: 0 })) };
  const episodeSync = { sync: vi.fn(async (options) => ({ scope: "episodes", options })) };
  const service = new AnimeDiscoveryService(aniList as never, metadata as never, anime as never, associations as never,
    new ProviderChain(providers), catalogSink as never, episodeSync as never);
  return { service, aniList, metadata, anime, associations, catalogSink, episodeSync };
}

describe("AnimeDiscoveryService", () => {
  it("importa somente após seleção explícita e permanece idempotente", async () => {
    const deps = dependencies([]);
    expect(await deps.service.importAnime(20)).toMatchObject({ operation: "created", anilistId: 20, aliasesProcessed: 2 });
    expect(await deps.service.importAnime(20)).toMatchObject({ operation: "updated", animeId: animeRow.id });
    expect(deps.aniList.getAnimeById).toHaveBeenCalledTimes(2);
    expect(deps.metadata.persist).toHaveBeenCalledTimes(2);
  });

  it("bloqueia conteúdo adulto antes da persistência", async () => {
    const deps = dependencies([]);
    deps.aniList.getAnimeById.mockResolvedValueOnce(media(true));
    await expect(deps.service.importAnime(20)).rejects.toMatchObject({ code: "ADULT_CONTENT_NOT_ALLOWED" });
    expect(deps.metadata.persist).not.toHaveBeenCalled();
  });

  it("usa Anikoto como principal e não mistura o ID com Anizone", async () => {
    const anikoto = provider("anikoto", ["anikoto-id"]);
    const anizone = provider("anizone", ["anizone-id"]);
    const deps = dependencies([anikoto, anizone]);
    await expect(deps.service.syncProvider(animeRow.id)).resolves.toMatchObject({ providerKey: "anikoto", providerAnimeId: "anikoto-id" });
    expect(anikoto.getAnimeDetails).toHaveBeenCalledWith(expect.objectContaining({ providerKey: "anikoto", providerAnimeId: "anikoto-id" }));
    expect(anizone.findAnime).not.toHaveBeenCalled();
  });

  it("usa Anizone como fallback quando Anikoto não encontra candidato", async () => {
    const anikoto = provider("anikoto", []);
    const anizone = provider("anizone", ["anizone-id"]);
    const deps = dependencies([anikoto, anizone]);
    await expect(deps.service.syncProvider(animeRow.id)).resolves.toMatchObject({ providerKey: "anizone", providerAnimeId: "anizone-id" });
  });

  it("interrompe matching ambíguo sem persistir", async () => {
    const deps = dependencies([provider("anikoto", ["candidate-1", "candidate-2"])]);
    await expect(deps.service.syncProvider(animeRow.id)).rejects.toMatchObject({ code: "PROVIDER_MATCH_AMBIGUOUS" });
    expect(deps.catalogSink.persist).not.toHaveBeenCalled();
  });

  it("sincroniza episódios separadamente usando apenas associação aprovada", async () => {
    const deps = dependencies([provider("anikoto", ["provider-a"]), provider("anizone", [])]);
    await deps.service.syncEpisodes(animeRow.id, { limit: 25, cursor: "10" });
    expect(deps.associations.findProviderAnimeByAnimeId).toHaveBeenCalledWith("anikoto", animeRow.id);
    expect(deps.episodeSync.sync).toHaveBeenCalledWith({
      providerKey: "anikoto", providerAnimeId: "provider-a", providerSeasonId: "default", cursor: "10", limit: 25,
    });
    expect(deps.catalogSink.persist).not.toHaveBeenCalled();
  });
});
