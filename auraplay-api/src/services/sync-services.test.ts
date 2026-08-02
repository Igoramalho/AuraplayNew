import { describe, expect, it, vi } from "vitest";

import type { EpisodeProvider } from "../lib/provider/interface";
import { PlaceholderProvider } from "../lib/provider/placeholder-provider";
import type { ProviderCatalogAnime } from "../lib/provider/types";
import type { AnimeRow, SyncJobRow } from "../lib/supabase/database.types";
import { CatalogSyncService } from "./catalog-sync.service";
import { EpisodeSyncService } from "./episode-sync.service";
import { ProviderSyncService } from "./provider-sync.service";
import { SearchService } from "./search.service";
import { SyncRunnerService } from "./sync-runner.service";
import { SyncService } from "./sync.service";

function syncRepository() {
  const baseJob: SyncJobRow = {
    id: "job", job_type: "test", status: "RUNNING", started_at: "2026-01-01T00:00:00Z", finished_at: null,
    processed_count: 0, created_count: 0, updated_count: 0, skipped_count: 0, error_count: 0, error_summary: null, metadata: {},
  };
  return {
    acquireLock: vi.fn(async () => true),
    releaseLock: vi.fn(async () => true),
    startJob: vi.fn(async () => baseJob),
    finishJob: vi.fn(async (_id: string, update: Partial<SyncJobRow>) => ({ ...baseJob, ...update })),
  };
}

function runner(repo = syncRepository()) {
  return { repo, value: new SyncRunnerService(repo, () => "owner") };
}

function configuredProvider(items: ProviderCatalogAnime[]): EpisodeProvider {
  return {
    key: "authorized-test",
    healthCheck: vi.fn(async () => ({ providerKey: "authorized-test", status: "ok" as const, checkedAt: new Date().toISOString(), latencyMs: 1 })),
    getCatalog: vi.fn(async ({ cursor } = {}) => ({ items, nextCursor: cursor ? null : "next", hasMore: !cursor })),
    findAnime: vi.fn(async () => []),
    getAnimeDetails: vi.fn(async () => { throw new Error("not used"); }),
    getSeasons: vi.fn(async () => []),
    getEpisodes: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    getPlayback: vi.fn(async () => { throw new Error("not used"); }),
  };
}

describe("serviços independentes de sincronização", () => {
  it("syncAll executa catálogo, provider e episódios nesta ordem", async () => {
    const order: string[] = [];
    const result = (scope: string, status: "SUCCEEDED" | "PARTIAL" = "SUCCEEDED") => ({
      scope, status, jobId: scope, counters: { processed: 0, created: 0, updated: 0, skipped: 0, errors: 0 }, nextCursor: null,
    });
    const catalog = { sync: vi.fn(async () => { order.push("catalog"); return result("catalog"); }) };
    const provider = { sync: vi.fn(async () => { order.push("provider"); return result("provider", "PARTIAL"); }) };
    const episodes = { sync: vi.fn(async () => { order.push("episodes"); return result("episodes", "PARTIAL"); }) };
    const all = await new SyncService(catalog as never, provider as never, episodes as never).syncAll({ limit: 2 });
    expect(order).toEqual(["catalog", "provider", "episodes"]);
    expect(all.status).toBe("PARTIAL");
  });

  it("provider não configurado registra PARTIAL e não consulta catálogo", async () => {
    const { repo, value } = runner();
    const provider = new PlaceholderProvider();
    const catalogSpy = vi.spyOn(provider, "getCatalog");
    const result = await new ProviderSyncService(value, provider).sync({ limit: 10 });
    expect(result).toMatchObject({ status: "PARTIAL", counters: { processed: 0, skipped: 1, errors: 0 } });
    expect(catalogSpy).not.toHaveBeenCalled();
    expect(repo.finishJob).toHaveBeenCalledWith("job", expect.objectContaining({ status: "PARTIAL", error_count: 0 }));
  });

  it("não sincroniza episódios com PlaceholderProvider nem altera READY", async () => {
    const { value } = runner();
    const provider = new PlaceholderProvider();
    const episodeSpy = vi.spyOn(provider, "getEpisodes");
    const sink = { persist: vi.fn(async () => ({ created: 1, updated: 0, skipped: 0 })) };
    const result = await new EpisodeSyncService(value, provider, sink).sync({
      providerKey: "none", providerAnimeId: "a", providerSeasonId: "s", limit: 10,
    });
    expect(result.status).toBe("PARTIAL");
    expect(episodeSpy).not.toHaveBeenCalled();
    expect(sink.persist).not.toHaveBeenCalled();
  });

  it("processa provider por cursor e delega persistência idempotente", async () => {
    const item: ProviderCatalogAnime = {
      providerKey: "authorized-test", providerAnimeId: "anime-1", title: "Anime", alternativeTitles: [], externalIds: { anilistId: 1 },
      format: "TV", year: 2026, available: true,
    };
    const provider = configuredProvider([item]);
    const stored = new Map<string, ProviderCatalogAnime>();
    const sink = {
      persist: vi.fn(async (items: ProviderCatalogAnime[]) => {
        let created = 0;
        let updated = 0;
        for (const current of items) {
          const key = `${current.providerKey}:${current.providerAnimeId}`;
          if (stored.has(key)) updated += 1;
          else created += 1;
          stored.set(key, current);
        }
        return { created, updated, skipped: 0 };
      }),
    };
    const first = await new ProviderSyncService(runner().value, provider, sink).sync({ limit: 1 });
    const second = await new ProviderSyncService(runner().value, provider, sink).sync({ cursor: first.nextCursor ?? undefined, limit: 1 });
    expect(first).toMatchObject({ status: "SUCCEEDED", nextCursor: "next", counters: { created: 1 } });
    expect(second).toMatchObject({ status: "SUCCEEDED", nextCursor: null, counters: { updated: 1 } });
    expect(stored.size).toBe(1);
  });

  it("falha externa do AniList registra FAILED sem apagar catálogo existente", async () => {
    const validCatalog = ["anime-1", "anime-2"];
    const catalog = { syncHomeCatalog: vi.fn(async () => { throw Object.assign(new Error("offline"), { code: "ANILIST_UNAVAILABLE" }); }) };
    const { repo, value } = runner();
    await expect(new CatalogSyncService(value, catalog).sync({ limit: 2 })).rejects.toMatchObject({ code: "ANILIST_UNAVAILABLE" });
    expect(validCatalog).toEqual(["anime-1", "anime-2"]);
    expect(repo.finishJob).toHaveBeenCalledWith("job", expect.objectContaining({ status: "FAILED" }));
  });

  it("busca consulta apenas o repository de leitura e não dispara sincronização", async () => {
    const rows: AnimeRow[] = [];
    const repository = { search: vi.fn(async () => rows) };
    const sync = vi.fn();
    const result = await new SearchService(repository).search({ q: "frieren", page: 1, limit: 20 });
    expect(result).toEqual([]);
    expect(repository.search).toHaveBeenCalledWith("frieren", 1, 20);
    expect(sync).not.toHaveBeenCalled();
  });
});
