import { getEnv } from "@/config/env";
import { memoryCache, type CacheStore } from "@/lib/cache/cache";
import { ExternalApiError } from "@/lib/http/errors";
import { delay, isRetryableStatus, retryDelayMs } from "@/lib/http/retry";
import { ANIME_BY_ID_QUERY, ANIME_SEARCH_QUERY, HOME_CATALOG_QUERY } from "@/lib/anilist/queries";
import { aniListErrorResponseSchema, animeByIdResponseSchema, animeSearchResponseSchema, homeCatalogResponseSchema } from "@/lib/anilist/schemas";
import type { AniListHomeCatalog, AniListMedia, AniListSearchResult, AniListSeason } from "@/lib/anilist/types";

const HOME_CACHE_TTL_MS = 15 * 60 * 1_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

function currentAnimeSeason(date = new Date()): { season: AniListSeason; year: number } {
  const month = date.getUTCMonth() + 1;
  const season: AniListSeason = month <= 3 ? "WINTER" : month <= 6 ? "SPRING" : month <= 9 ? "SUMMER" : "FALL";
  return { season, year: date.getUTCFullYear() };
}

function fuzzyDateInt(date: Date): number {
  return Number(`${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`);
}

export class AniListClient {
  constructor(private readonly cache: CacheStore = memoryCache) {}

  async getAnimeById(anilistId: number): Promise<AniListMedia> {
    if (!Number.isSafeInteger(anilistId) || anilistId <= 0) {
      throw new ExternalApiError("ANILIST_INVALID_ID", "O AniList ID deve ser um inteiro positivo.");
    }
    const response = await this.request({ query: ANIME_BY_ID_QUERY, variables: { id: anilistId } });
    const graphQLError = aniListErrorResponseSchema.safeParse(response);
    if (graphQLError.success) {
      throw new ExternalApiError("ANILIST_GRAPHQL_ERROR", graphQLError.data.errors.map((error) => error.message).join("; "));
    }
    const parsed = animeByIdResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ExternalApiError("ANILIST_INVALID_RESPONSE", "O AniList retornou dados em formato inesperado.", undefined, { cause: parsed.error });
    }
    if (!parsed.data.data.anime) {
      throw new ExternalApiError("ANILIST_ANIME_NOT_FOUND", `AniList ID ${anilistId} não encontrado.`, 404);
    }
    return parsed.data.data.anime;
  }

  async searchAnime(query: string, page = 1, limit = 20): Promise<AniListSearchResult> {
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2 || normalizedQuery.length > 100) {
      throw new ExternalApiError("ANILIST_INVALID_QUERY", "A consulta deve ter entre 2 e 100 caracteres.");
    }
    const normalizedPage = Math.max(1, Math.trunc(page));
    const normalizedLimit = Math.min(Math.max(1, Math.trunc(limit)), 50);
    const response = await this.request({
      query: ANIME_SEARCH_QUERY,
      variables: { query: normalizedQuery, page: normalizedPage, perPage: normalizedLimit },
    });
    const graphQLError = aniListErrorResponseSchema.safeParse(response);
    if (graphQLError.success) {
      throw new ExternalApiError("ANILIST_GRAPHQL_ERROR", graphQLError.data.errors.map((error) => error.message).join("; "));
    }
    const parsed = animeSearchResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ExternalApiError("ANILIST_INVALID_RESPONSE", "O AniList retornou dados em formato inesperado.", undefined, { cause: parsed.error });
    }
    const result = parsed.data.data.page;
    return {
      items: result.media.filter((item) => !item.isAdult),
      page: result.pageInfo.currentPage,
      limit: result.pageInfo.perPage,
      total: result.pageInfo.total,
      hasNextPage: result.pageInfo.hasNextPage,
    };
  }

  async getHomeCatalog(perPage = 20): Promise<AniListHomeCatalog> {
    const boundedPerPage = Math.min(Math.max(perPage, 1), 50);
    const { season, year } = currentAnimeSeason();
    const cacheKey = `anilist:home:${season}:${year}:${boundedPerPage}`;
    const cached = this.cache.get<AniListHomeCatalog>(cacheKey);
    if (cached) return cached;

    const response = await this.request({
      query: HOME_CATALOG_QUERY,
      variables: { season, seasonYear: year, recentBefore: fuzzyDateInt(new Date()), perPage: boundedPerPage },
    });
    const graphQLError = aniListErrorResponseSchema.safeParse(response);
    if (graphQLError.success) {
      throw new ExternalApiError("ANILIST_GRAPHQL_ERROR", graphQLError.data.errors.map((error) => error.message).join("; "));
    }
    const parsed = homeCatalogResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ExternalApiError("ANILIST_INVALID_RESPONSE", "O AniList retornou dados em formato inesperado.", undefined, { cause: parsed.error });
    }
    const data: AniListHomeCatalog = {
      featured: parsed.data.data.featured.media,
      popularSeason: parsed.data.data.popularSeason.media,
      recentReleases: parsed.data.data.recentReleases.media,
      airingNow: parsed.data.data.airingNow.media,
    };
    this.cache.set(cacheKey, data, HOME_CACHE_TTL_MS);
    return data;
  }

  private async request(body: { query: string; variables: Record<string, unknown> }): Promise<unknown> {
    const { ANILIST_GRAPHQL_URL } = getEnv();
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(ANILIST_GRAPHQL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "AuraPlay-API/0.1" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          cache: "no-store",
        });

        if (response.ok) return await response.json();
        const error = new ExternalApiError("ANILIST_HTTP_ERROR", `AniList respondeu com HTTP ${response.status}.`, response.status);
        if (!isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS - 1) throw error;
        lastError = error;
        await delay(retryDelayMs(attempt, response.headers.get("retry-after")));
      } catch (error) {
        if (error instanceof ExternalApiError) throw error;
        lastError = error;
        if (attempt === MAX_ATTEMPTS - 1) break;
        await delay(retryDelayMs(attempt, null));
      }
    }

    throw new ExternalApiError("ANILIST_UNAVAILABLE", "AniList temporariamente indisponível.", undefined, { cause: lastError });
  }
}
