import { describe, expect, it } from "vitest";

import type { AnimeRow, EpisodeRow, EpisodeSourceRow, ProviderAnimeRow, SeasonRow } from "@/lib/supabase/database.types";
import type { ProviderCatalogAnime, ProviderEpisode } from "@/lib/provider/types";
import { EpisodePersistenceSink, ProviderCatalogPersistenceSink } from "./provider-persistence.sink";

class MemoryPersistence {
  providerAnimes = new Map<string, ProviderAnimeRow>();
  seasons = new Map<string, SeasonRow>();
  episodes = new Map<string, EpisodeRow>();
  sources = new Map<string, EpisodeSourceRow>();
  animes: AnimeRow[] = [];
  candidates: AnimeRow[] = [];

  providerKey(key: string, id: string) { return `${key}:${id}`; }
  async findProviderAnime(key: string, id: string) { return this.providerAnimes.get(this.providerKey(key, id)) ?? null; }
  async findProviderAnimeByAnimeId(key: string, animeId: string) {
    return [...this.providerAnimes.values()].find((item) => item.provider_key === key && item.anime_id === animeId) ?? null;
  }
  async findAnimeByAnilistId(id: number) { return this.animes.find((anime) => anime.anilist_id === id) ?? null; }
  async findAnimeByMalId(id: number) { return this.animes.find((anime) => anime.mal_id === id) ?? null; }
  async findAnimeCandidates() { return this.candidates; }
  async upsertProviderAnime(input: Partial<ProviderAnimeRow> & Pick<ProviderAnimeRow, "provider_key" | "provider_anime_id" | "provider_title">) {
    const key = this.providerKey(input.provider_key, input.provider_anime_id);
    const row = { id: `pa-${key}`, created_at: "now", updated_at: "now", ...this.providerAnimes.get(key), ...input } as ProviderAnimeRow;
    this.providerAnimes.set(key, row); return row;
  }
  async findSeason(key: string, animeId: string, seasonId: string) { return this.seasons.get(`${key}:${animeId}:${seasonId}`) ?? null; }
  async upsertSeason(input: Partial<SeasonRow> & Pick<SeasonRow, "provider_key" | "provider_anime_id" | "provider_season_id">) {
    const key = `${input.provider_key}:${input.provider_anime_id}:${input.provider_season_id}`;
    const row = { id: `season-${key}`, created_at: "now", updated_at: "now", ...this.seasons.get(key), ...input } as SeasonRow;
    this.seasons.set(key, row); return row;
  }
  async findEpisode(seasonId: string, episodeId: string) { return this.episodes.get(`${seasonId}:${episodeId}`) ?? null; }
  async upsertEpisode(input: Partial<EpisodeRow> & Pick<EpisodeRow, "season_id" | "provider_episode_id">) {
    const key = `${input.season_id}:${input.provider_episode_id}`;
    const row = { id: `episode-${key}`, created_at: "now", updated_at: "now", ...this.episodes.get(key), ...input } as EpisodeRow;
    this.episodes.set(key, row); return row;
  }
  async findEpisodeSource(episodeId: string, providerKey: string, sourceId: string, audioType: string) {
    return this.sources.get(`${episodeId}:${providerKey}:${sourceId}:${audioType}`) ?? null;
  }
  async upsertEpisodeSource(input: Partial<EpisodeSourceRow> & Pick<EpisodeSourceRow, "episode_id" | "provider_key" | "provider_source_id" | "audio_type">) {
    const key = `${input.episode_id}:${input.provider_key}:${input.provider_source_id}:${input.audio_type}`;
    const row = { id: `source-${key}`, created_at: "now", updated_at: "now", ...this.sources.get(key), ...input } as EpisodeSourceRow;
    this.sources.set(key, row); return row;
  }
}

function anime(id: string, anilistId: number, malId: number | null = null): AnimeRow {
  return { id, anilist_id: anilistId, mal_id: malId, preferred_title: id, season_year: 2024, format: "TV" } as AnimeRow;
}

function catalog(externalIds: ProviderCatalogAnime["externalIds"] = {}): ProviderCatalogAnime {
  return { providerKey: "anikoto", providerAnimeId: "provider-a", title: "Anime", alternativeTitles: [], externalIds, format: "TV", year: 2024, available: true };
}

function episode(sources: ProviderEpisode["sources"], number = 1): ProviderEpisode {
  return {
    providerKey: "anikoto", providerAnimeId: "provider-a", providerSeasonId: "default", providerEpisodeId: "episode-1",
    number, absoluteNumber: 1, title: "Episode 1", description: null, durationSeconds: null, thumbnailUrl: null,
    airedAt: null, audioType: "SUB", language: null, available: true, sources,
  };
}

describe("persistência idempotente do provider", () => {
  it("preserva a associação estável sem encaminhar imagens extras do provider", async () => {
    const repository = new MemoryPersistence();
    repository.animes = [anime("a1", 100)];
    const sink = new ProviderCatalogPersistenceSink(repository as never, () => "sync-time");
    const item = { ...catalog({ anilistId: 100 }), coverUrl: "https://provider.test/poster.jpg", posterUrl: "https://provider.test/poster-2.jpg" };

    await sink.persist([item]);

    const persisted = [...repository.providerAnimes.values()][0] as unknown as Record<string, unknown>;
    expect(persisted).toMatchObject({
      provider_key: "anikoto",
      provider_anime_id: "provider-a",
      anime_id: "a1",
      match_status: "AUTO_MATCHED",
      match_method: "ANILIST_ID",
    });
    expect(persisted).not.toHaveProperty("coverUrl");
    expect(persisted).not.toHaveProperty("cover_url");
    expect(persisted).not.toHaveProperty("posterUrl");
    expect(persisted).not.toHaveProperty("poster_url");
  });

  it("faz matching forte por AniList e a segunda execução atualiza sem duplicar", async () => {
    const repository = new MemoryPersistence();
    repository.animes = [anime("a1", 100)];
    const sink = new ProviderCatalogPersistenceSink(repository as never, () => "sync-time");
    await expect(sink.persist([catalog({ anilistId: 100 })])).resolves.toMatchObject({ created: 1, updated: 0, skipped: 0 });
    await expect(sink.persist([catalog({ anilistId: 100 })])).resolves.toMatchObject({ created: 0, updated: 1, skipped: 0 });
    expect(repository.providerAnimes.size).toBe(1);
    expect([...repository.providerAnimes.values()][0]).toMatchObject({ anime_id: "a1", match_status: "AUTO_MATCHED", match_method: "ANILIST_ID" });
  });

  it("faz matching forte por MAL", async () => {
    const repository = new MemoryPersistence();
    repository.animes = [anime("a2", 200, 300)];
    const sink = new ProviderCatalogPersistenceSink(repository as never);
    await sink.persist([catalog({ malId: 300 })]);
    expect([...repository.providerAnimes.values()][0]).toMatchObject({ anime_id: "a2", match_method: "MAL_ID" });
  });

  it("não aprova automaticamente matching ambíguo por metadados", async () => {
    const repository = new MemoryPersistence();
    repository.candidates = [anime("a1", 1), anime("a2", 2)];
    const sink = new ProviderCatalogPersistenceSink(repository as never);
    await expect(sink.persist([catalog()])).resolves.toMatchObject({ skipped: 1, needsReview: 1 });
    expect([...repository.providerAnimes.values()][0]).toMatchObject({ anime_id: null, match_status: "AMBIGUOUS" });
  });
});

describe("persistência idempotente de episódios", () => {
  function matchedRepository() {
    const repository = new MemoryPersistence();
    repository.providerAnimes.set("anikoto:provider-a", {
      id: "pa", anime_id: "a1", provider_key: "anikoto", provider_anime_id: "provider-a", provider_title: "Anime",
      match_status: "AUTO_MATCHED", match_confidence: 1, match_method: "ANILIST_ID", last_sync_at: "now", created_at: "now", updated_at: "now",
    });
    return repository;
  }

  it("reutiliza temporada default e atualiza episódio/fonte sem duplicar", async () => {
    const repository = matchedRepository();
    const sink = new EpisodePersistenceSink(repository as never, () => "checked");
    const item = episode([{ providerSourceId: "sub:server", providerKey: "anikoto", server: "server", language: "pt", audioType: "SUB", quality: "1080p", available: true }]);
    await expect(sink.persist([item])).resolves.toMatchObject({ created: 1, sourceCreated: 1 });
    await expect(sink.persist([{ ...item, title: "Atualizado" }])).resolves.toMatchObject({ updated: 1, sourceUpdated: 1 });
    expect(repository.seasons.size).toBe(1);
    expect([...repository.seasons.values()][0]).toMatchObject({ provider_season_id: "default", season_number: 1, display_order: 0 });
    expect(repository.episodes.size).toBe(1);
    expect(repository.sources.size).toBe(1);
    expect([...repository.episodes.values()][0]?.title).toBe("Atualizado");
  });

  it("descarta thumbnailUrl externa antes de enviar o episódio ao repository", async () => {
    const repository = matchedRepository();
    const sink = new EpisodePersistenceSink(repository as never);
    const item = { ...episode([]), thumbnailUrl: "https://provider.test/episode.jpg" };

    await sink.persist([item]);

    const persisted = [...repository.episodes.values()][0] as unknown as Record<string, unknown>;
    expect(persisted).toMatchObject({
      provider_episode_id: "episode-1",
      episode_number: 1,
      title: "Episode 1",
      thumbnail_url: null,
    });
    expect(JSON.stringify(persisted)).not.toContain("https://provider.test/episode.jpg");
  });

  it("ignora RAW sem converter e nunca persiste playback resolvido", async () => {
    const repository = matchedRepository();
    const sink = new EpisodePersistenceSink(repository as never);
    const result = await sink.persist([episode([
      { providerSourceId: "raw:server", providerKey: "anikoto", server: "server", language: "ja", audioType: "RAW", quality: null, available: true },
      { providerSourceId: "sub:server", providerKey: "anikoto", server: "server", language: "pt", audioType: "SUB", quality: null, available: true },
    ])]);
    expect(result).toMatchObject({ rawSkipped: 1, skippedReasons: { RAW_NOT_SUPPORTED_BY_DATABASE: 1 } });
    expect(repository.sources.size).toBe(1);
    const persisted = [...repository.sources.values()][0] as unknown as Record<string, unknown>;
    expect(persisted.audio_type).toBe("SUB");
    expect(persisted).not.toHaveProperty("url");
    expect(persisted).not.toHaveProperty("headers");
    expect(persisted).not.toHaveProperty("subtitleTracks");
  });

  it("valida o lote antes de escrever e pula número não documentado", async () => {
    const repository = matchedRepository();
    const sink = new EpisodePersistenceSink(repository as never);
    await expect(sink.persist([episode([], Number.NaN)])).resolves.toMatchObject({
      created: 0,
      skipped: 1,
      skippedReasons: { EPISODE_NUMBER_NOT_DOCUMENTED: 1 },
    });
    expect(repository.seasons.size).toBe(0);
    expect(repository.episodes.size).toBe(0);
  });
});
