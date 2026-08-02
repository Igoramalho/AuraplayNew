import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { FixedWindowRateLimiter } from "./rate-limit";
import { isInternalRequestAuthorized } from "../auth/internal-auth";
import {
  createAllSyncHandler,
  createAnimeEpisodeDiscoveryHandler,
  createAnimeImportHandler,
  createAnimeProviderDiscoveryHandler,
  createCatalogSyncHandler,
  createEpisodeSyncHandler,
  createProviderSyncHandler,
} from "./internal-handlers";

function dependencies(episodeTargetRequired = false) {
  return {
    episodeTargetRequired,
    sync: {
      syncCatalog: vi.fn(async () => ({ scope: "catalog", status: "SUCCEEDED" })),
      syncProvider: vi.fn(async () => ({ scope: "provider", status: "PARTIAL" })),
      syncEpisodes: vi.fn(async () => ({ scope: "episodes", status: "PARTIAL" })),
      syncAll: vi.fn(async () => ({ status: "PARTIAL" })),
    },
    animeDiscovery: {
      importAnime: vi.fn(async () => ({ operation: "created" })),
      syncProvider: vi.fn(async () => ({ providerKey: "anikoto" })),
      syncEpisodes: vi.fn(async () => ({ status: "SUCCEEDED" })),
    },
  };
}

function request(body: unknown = {}, authorization?: string, ip = "127.0.0.1") {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": ip };
  if (authorization) headers.authorization = authorization;
  return new NextRequest("http://localhost/api/internal/sync", { method: "POST", headers, body: JSON.stringify(body) });
}

const authorized = () => true;

describe("rotas internas de sincronização", () => {
  it("aceita exclusivamente Bearer com segredo exato", () => {
    const secret = "1234567890abcdef";
    expect(isInternalRequestAuthorized(request({}, `Bearer ${secret}`), secret)).toBe(true);
    expect(isInternalRequestAuthorized(request({}, secret), secret)).toBe(false);
    expect(isInternalRequestAuthorized(request({}, "Bearer incorreto"), secret)).toBe(false);
  });

  it("rejeita segredo ausente ou incorreto sem executar serviço", async () => {
    const deps = dependencies();
    const handler = createCatalogSyncHandler(() => deps, () => false);
    for (const auth of [undefined, "Bearer incorreto"]) {
      const response = await handler(request({}, auth));
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
    }
    expect(deps.sync.syncCatalog).not.toHaveBeenCalled();
  });

  it("não aceita segredo em query string", async () => {
    const deps = dependencies();
    const handler = createCatalogSyncHandler(() => deps, (req) => req.headers.get("authorization") === "Bearer valid");
    const response = await handler(new NextRequest("http://localhost/api/internal/sync?sync_token=example", { method: "POST", body: "{}" }));
    expect(response.status).toBe(401);
  });

  it("valida cursor/lote e encaminha catálogo e provider", async () => {
    const deps = dependencies();
    const payload = { cursor: "cursor-1", limit: 10 };
    expect((await createCatalogSyncHandler(() => deps, authorized)(request(payload))).status).toBe(200);
    expect((await createProviderSyncHandler(() => deps, authorized)(request(payload, undefined, "127.0.0.2"))).status).toBe(200);
    expect(deps.sync.syncCatalog).toHaveBeenCalledWith(payload);
    expect(deps.sync.syncProvider).toHaveBeenCalledWith(payload);
  });

  it("rejeita lote acima de 100", async () => {
    const response = await createCatalogSyncHandler(() => dependencies(), authorized)(request({ limit: 101 }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("permite episódios sem alvo somente para PlaceholderProvider", async () => {
    const placeholder = dependencies(false);
    const response = await createEpisodeSyncHandler(() => placeholder, authorized)(request({ limit: 5 }));
    expect(response.status).toBe(200);
    expect(placeholder.sync.syncEpisodes).toHaveBeenCalledWith({ cursor: undefined, limit: 5 });

    const configured = dependencies(true);
    const rejected = await createEpisodeSyncHandler(() => configured, authorized)(request({ limit: 5 }, undefined, "127.0.0.3"));
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({ error: { code: "EPISODE_TARGET_REQUIRED" } });
  });

  it("aceita alvo completo para provider real", async () => {
    const deps = dependencies(true);
    const target = { providerKey: "authorized", providerAnimeId: "anime", providerSeasonId: "season" };
    const response = await createEpisodeSyncHandler(() => deps, authorized)(request({ limit: 5, target }));
    expect(response.status).toBe(200);
    expect(deps.sync.syncEpisodes).toHaveBeenCalledWith({ cursor: undefined, limit: 5, ...target });
  });

  it("/all encaminha lote e alvo sem duplicar lógica", async () => {
    const deps = dependencies(false);
    const response = await createAllSyncHandler(() => deps, authorized)(request({ cursor: "c", limit: 2 }));
    expect(response.status).toBe(200);
    expect(deps.sync.syncAll).toHaveBeenCalledWith({ cursor: "c", limit: 2, episodeTarget: undefined });
  });

  it("aplica rate limit às rotas internas", async () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000, () => 1_000);
    const handler = createCatalogSyncHandler(() => dependencies(), authorized, limiter);
    expect((await handler(request())).status).toBe(200);
    expect((await handler(request())).status).toBe(429);
  });

  it("importa somente o AniList ID explicitamente selecionado e exige autenticação", async () => {
    const deps = dependencies();
    const handler = createAnimeImportHandler(() => deps, authorized);
    expect((await handler(request({ anilistId: 20 }))).status).toBe(200);
    expect(deps.animeDiscovery.importAnime).toHaveBeenCalledWith(20);

    const denied = createAnimeImportHandler(() => deps, () => false);
    expect((await denied(request({ anilistId: 21 }, undefined, "127.0.0.8"))).status).toBe(401);
    expect(deps.animeDiscovery.importAnime).not.toHaveBeenCalledWith(21);
  });

  it("mantém provider e episódios em ações internas separadas", async () => {
    const deps = dependencies();
    const animeId = "123e4567-e89b-42d3-a456-426614174000";
    const context = { params: Promise.resolve({ animeId }) };
    const providerResponse = await createAnimeProviderDiscoveryHandler(() => deps, authorized)(request(), context);
    expect(providerResponse.status).toBe(200);
    expect(deps.animeDiscovery.syncProvider).toHaveBeenCalledWith(animeId);
    expect(deps.animeDiscovery.syncEpisodes).not.toHaveBeenCalled();

    const episodeResponse = await createAnimeEpisodeDiscoveryHandler(() => deps, authorized)(
      request({ providerKey: "anikoto", cursor: "10", limit: 25 }, undefined, "127.0.0.9"), context,
    );
    expect(episodeResponse.status).toBe(200);
    expect(deps.animeDiscovery.syncEpisodes).toHaveBeenCalledWith(animeId, { providerKey: "anikoto", cursor: "10", limit: 25 });
  });
});
