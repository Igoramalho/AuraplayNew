import type { NextRequest } from "next/server";

import { animeIdentifierSchema, uuidSchema } from "../../schemas/anime.schema";
import { searchSchema } from "../../schemas/search.schema";
import { FixedWindowRateLimiter } from "./rate-limit";
import { ApiHttpError, apiError, apiSuccess, newRequestId } from "./response";

interface PublicServices {
  health: { getHealth(): Promise<unknown> };
  home: { getHome(): Promise<unknown> };
  search: { search(input: { q: string; page: number; limit: number }): Promise<unknown[]> };
  remoteSearch: { search(input: { q: string; page: number; limit: number }): Promise<{ items: unknown[]; page: number; limit: number; total: number; hasNextPage: boolean }> };
  anime: { getAnime(identifier: { kind: "internal"; value: string } | { kind: "anilist"; value: number }): Promise<unknown> };
  episodes: { getEpisodes(identifier: { kind: "internal"; value: string } | { kind: "anilist"; value: number }): Promise<unknown> };
  playback: { getPlayback(episodeId: string): Promise<unknown> };
}
type ServiceFactory = () => PublicServices;

export function createHealthHandler(services: ServiceFactory) {
  return async function GET() {
    const requestId = newRequestId();
    try { return apiSuccess(await services().health.getHealth(), requestId); }
    catch (error) { return apiError(error, requestId); }
  };
}

export function createHomeHandler(services: ServiceFactory) {
  return async function GET() {
    const requestId = newRequestId();
    try { return apiSuccess(await services().home.getHome(), requestId); }
    catch (error) { return apiError(error, requestId); }
  };
}

export function createSearchHandler(services: ServiceFactory) {
  return async function GET(request: NextRequest) {
    const requestId = newRequestId();
    try {
      const input = searchSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const items = await services().search.search(input);
      return apiSuccess(items, requestId, 200, { page: input.page, limit: input.limit, count: items.length });
    } catch (error) { return apiError(error, requestId); }
  };
}

export function createRemoteSearchHandler(services: ServiceFactory) {
  return async function GET(request: NextRequest) {
    const requestId = newRequestId();
    try {
      const input = searchSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
      const result = await services().remoteSearch.search(input);
      return apiSuccess(result.items, requestId, 200, {
        page: result.page,
        limit: result.limit,
        total: result.total,
        count: result.items.length,
        hasNextPage: result.hasNextPage,
      });
    } catch (error) { return apiError(error, requestId); }
  };
}

export function createAnimeHandler(services: ServiceFactory) {
  return async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const requestId = newRequestId();
    try {
      const { id } = await context.params;
      return apiSuccess(await services().anime.getAnime(animeIdentifierSchema.parse(id)), requestId);
    } catch (error) { return apiError(error, requestId); }
  };
}

export function createEpisodesHandler(services: ServiceFactory) {
  return async function GET(_request: NextRequest, context: { params: Promise<{ animeId: string }> }) {
    const requestId = newRequestId();
    try {
      const { animeId } = await context.params;
      return apiSuccess(await services().episodes.getEpisodes(animeIdentifierSchema.parse(animeId)), requestId);
    } catch (error) { return apiError(error, requestId); }
  };
}

export function createPlaybackHandler(services: ServiceFactory, limiter = new FixedWindowRateLimiter(20, 60_000)) {
  return async function GET(request: NextRequest, context: { params: Promise<{ episodeId: string }> }) {
    const requestId = newRequestId();
    try {
      const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
      const rate = limiter.consume(clientKey);
      if (!rate.allowed) {
        const response = apiError(new ApiHttpError(429, "RATE_LIMITED", "Muitas solicitações de reprodução."), requestId);
        response.headers.set("retry-after", String(rate.retryAfterSeconds));
        return response;
      }
      const { episodeId } = await context.params;
      return apiSuccess(await services().playback.getPlayback(uuidSchema.parse(episodeId)), requestId);
    } catch (error) { return apiError(error, requestId); }
  };
}
