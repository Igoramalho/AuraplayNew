import type { NextRequest } from "next/server";

import { isInternalRequestAuthorized } from "../auth/internal-auth";
import { FixedWindowRateLimiter } from "./rate-limit";
import { ApiHttpError, apiError, apiSuccess, newRequestId } from "./response";
import { episodeSyncRequestSchema, syncAllRequestSchema, syncRequestSchema } from "../../schemas/sync.schema";
import { animeEpisodeDiscoverySyncSchema, animeImportSchema } from "../../schemas/discovery.schema";
import { uuidSchema } from "../../schemas/anime.schema";

interface InternalSyncPort {
  syncCatalog(options: { cursor?: string; limit: number }): Promise<unknown>;
  syncProvider(options: { cursor?: string; limit: number }): Promise<unknown>;
  syncEpisodes(options: { cursor?: string; limit: number; providerKey?: string; providerAnimeId?: string; providerSeasonId?: string }): Promise<unknown>;
  syncAll(options: { cursor?: string; limit: number; episodeTarget?: { providerKey: string; providerAnimeId: string; providerSeasonId: string } }): Promise<unknown>;
}

interface InternalServices {
  sync: InternalSyncPort;
  episodeTargetRequired: boolean;
  animeDiscovery?: {
    importAnime(anilistId: number): Promise<unknown>;
    syncProvider(animeId: string): Promise<unknown>;
    syncEpisodes(animeId: string, options: { providerKey?: string; cursor?: string; limit: number }): Promise<unknown>;
  };
}
type ServicesFactory = () => InternalServices;
type Auth = (request: Request) => boolean;

async function body(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text.trim()) return {};
  try { return JSON.parse(text); }
  catch { throw new ApiHttpError(400, "INVALID_JSON", "Corpo JSON inválido."); }
}

function createHandler(
  services: ServicesFactory,
  execute: (dependencies: InternalServices, payload: unknown, context?: unknown) => Promise<unknown>,
  authorize: Auth = isInternalRequestAuthorized,
  limiter = new FixedWindowRateLimiter(10, 60_000),
) {
  return async function POST(request: NextRequest, context?: unknown) {
    const requestId = newRequestId();
    try {
      const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      if (!limiter.consume(key).allowed) throw new ApiHttpError(429, "RATE_LIMITED", "Muitas solicitações de sincronização.");
      if (!authorize(request)) throw new ApiHttpError(401, "UNAUTHORIZED", "Não autorizado.");
      return apiSuccess(await execute(services(), await body(request), context), requestId);
    } catch (error) { return apiError(error, requestId); }
  };
}

function discoveryService(dependencies: InternalServices) {
  if (!dependencies.animeDiscovery) throw new ApiHttpError(500, "DISCOVERY_SERVICE_NOT_CONFIGURED", "Serviço de descoberta não configurado.");
  return dependencies.animeDiscovery;
}

export function createCatalogSyncHandler(services: ServicesFactory, authorize?: Auth, limiter?: FixedWindowRateLimiter) {
  return createHandler(services, async ({ sync }, raw) => {
    const payload = syncRequestSchema.parse(raw);
    return sync.syncCatalog({ cursor: payload.cursor, limit: payload.limit });
  }, authorize, limiter);
}

export function createProviderSyncHandler(services: ServicesFactory, authorize?: Auth, limiter?: FixedWindowRateLimiter) {
  return createHandler(services, async ({ sync }, raw) => {
    const payload = syncRequestSchema.parse(raw);
    return sync.syncProvider({ cursor: payload.cursor, limit: payload.limit });
  }, authorize, limiter);
}

export function createEpisodeSyncHandler(services: ServicesFactory, authorize?: Auth, limiter?: FixedWindowRateLimiter) {
  return createHandler(services, async (dependencies, raw) => {
    const payload = episodeSyncRequestSchema.parse(raw);
    if (dependencies.episodeTargetRequired && !payload.target) throw new ApiHttpError(400, "EPISODE_TARGET_REQUIRED", "Alvo de episódios obrigatório.");
    return dependencies.sync.syncEpisodes({ cursor: payload.cursor, limit: payload.limit, ...payload.target });
  }, authorize, limiter);
}

export function createAllSyncHandler(services: ServicesFactory, authorize?: Auth, limiter?: FixedWindowRateLimiter) {
  return createHandler(services, async (dependencies, raw) => {
    const payload = syncAllRequestSchema.parse(raw);
    if (dependencies.episodeTargetRequired && !payload.episodeTarget) throw new ApiHttpError(400, "EPISODE_TARGET_REQUIRED", "Alvo de episódios obrigatório.");
    return dependencies.sync.syncAll({ cursor: payload.cursor, limit: payload.limit, episodeTarget: payload.episodeTarget });
  }, authorize, limiter);
}

export function createAnimeImportHandler(services: ServicesFactory, authorize?: Auth, limiter?: FixedWindowRateLimiter) {
  return createHandler(services, async (dependencies, raw) => {
    const payload = animeImportSchema.parse(raw);
    return discoveryService(dependencies).importAnime(payload.anilistId);
  }, authorize, limiter);
}

type AnimeContext = { params: Promise<{ animeId: string }> };

export function createAnimeProviderDiscoveryHandler(services: ServicesFactory, authorize?: Auth, limiter?: FixedWindowRateLimiter) {
  return createHandler(services, async (dependencies, _raw, rawContext) => {
    const context = rawContext as AnimeContext;
    const { animeId } = await context.params;
    return discoveryService(dependencies).syncProvider(uuidSchema.parse(animeId));
  }, authorize, limiter);
}

export function createAnimeEpisodeDiscoveryHandler(services: ServicesFactory, authorize?: Auth, limiter?: FixedWindowRateLimiter) {
  return createHandler(services, async (dependencies, raw, rawContext) => {
    const payload = animeEpisodeDiscoverySyncSchema.parse(raw);
    const context = rawContext as AnimeContext;
    const { animeId } = await context.params;
    return discoveryService(dependencies).syncEpisodes(uuidSchema.parse(animeId), payload);
  }, authorize, limiter);
}
