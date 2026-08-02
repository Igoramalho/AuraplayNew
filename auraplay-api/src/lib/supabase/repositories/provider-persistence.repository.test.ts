import { describe, expect, it, vi } from "vitest";

import type { EpisodeRow, EpisodeSourceRow, ProviderAnimeRow, SeasonRow } from "../database.types";
import { ProviderPersistenceRepository } from "./provider-persistence.repository";

function mutationResult<T>(data: T) {
  const query = {
    upsert: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(() => query),
    then(resolve: (value: { data: T; error: null }) => unknown) { return Promise.resolve(resolve({ data, error: null })); },
  };
  return query;
}

describe("ProviderPersistenceRepository", () => {
  it("usa as constraints existentes nos quatro upserts idempotentes", async () => {
    const providerQuery = mutationResult({ id: "pa" } as ProviderAnimeRow);
    const seasonQuery = mutationResult({ id: "s" } as SeasonRow);
    const episodeQuery = mutationResult({ id: "e" } as EpisodeRow);
    const sourceQuery = mutationResult({ id: "src" } as EpisodeSourceRow);
    const db = { from: vi.fn((table: string) => ({
      provider_animes: providerQuery,
      seasons: seasonQuery,
      episodes: episodeQuery,
      episode_sources: sourceQuery,
    })[table as "provider_animes"] ) };
    const repository = new ProviderPersistenceRepository(db as never);

    await repository.upsertProviderAnime({ provider_key: "anikoto", provider_anime_id: "a", provider_title: "Anime" });
    await repository.upsertSeason({ anime_id: "anime", provider_key: "anikoto", provider_anime_id: "a", provider_season_id: "default", season_number: 1 });
    await repository.upsertEpisode({ anime_id: "anime", season_id: "s", provider_episode_id: "e", episode_number: 1 });
    await repository.upsertEpisodeSource({ episode_id: "e", provider_key: "anikoto", provider_source_id: "sub:server" });

    expect(providerQuery.upsert).toHaveBeenCalledWith(expect.anything(), { onConflict: "provider_key,provider_anime_id" });
    expect(seasonQuery.upsert).toHaveBeenCalledWith(expect.anything(), { onConflict: "provider_key,provider_anime_id,provider_season_id" });
    expect(episodeQuery.upsert).toHaveBeenCalledWith(expect.anything(), { onConflict: "season_id,provider_episode_id" });
    expect(sourceQuery.upsert).toHaveBeenCalledWith(expect.anything(), { onConflict: "episode_id,provider_key,provider_source_id,audio_type" });
  });
});
