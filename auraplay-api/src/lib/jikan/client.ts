import pLimit from "p-limit";

import { getEnv } from "../../config/env";
import { ExternalApiError } from "../http/errors";
import { delay, isRetryableStatus, retryDelayMs } from "../http/retry";
import { JikanCache } from "./cache";
import { jikanAnimeResponseSchema } from "./schemas";
import type { JikanAnimeMetadata } from "./types";

interface JikanClientOptions {
  fetcher?: typeof fetch;
  cache?: JikanCache;
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
  timeoutMs?: number;
  maxAttempts?: number;
  baseUrl?: string;
}

function parseDurationMinutes(value: string | null): number | null {
  if (!value) return null;
  const hours = /([0-9]+)\s*hr/.exec(value)?.[1];
  const minutes = /([0-9]+)\s*min/.exec(value)?.[1];
  if (!hours && !minutes) return null;
  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}

export class JikanClient {
  private readonly limiter = pLimit(1);
  private readonly fetcher: typeof fetch;
  private readonly cache: JikanCache;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly configuredBaseUrl?: string;
  private nextRequestAt = 0;

  constructor(options: JikanClientOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.cache = options.cache ?? new JikanCache();
    this.sleep = options.sleep ?? delay;
    this.minIntervalMs = options.minIntervalMs ?? 350;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.configuredBaseUrl = options.baseUrl;
  }

  async getAnimeByMalId(malId: number): Promise<JikanAnimeMetadata> {
    if (!Number.isInteger(malId) || malId <= 0) {
      throw new ExternalApiError("JIKAN_INVALID_MAL_ID", "MAL ID inválido.", 400);
    }
    const cached = this.cache.get(malId);
    if (cached) return cached;

    return this.limiter(async () => {
      const secondCacheCheck = this.cache.get(malId);
      if (secondCacheCheck) return secondCacheCheck;
      const waitMs = Math.max(0, this.nextRequestAt - Date.now());
      if (waitMs > 0) await this.sleep(waitMs);
      this.nextRequestAt = Date.now() + this.minIntervalMs;
      const metadata = await this.request(malId);
      this.cache.set(malId, metadata);
      return metadata;
    });
  }

  private async request(malId: number): Promise<JikanAnimeMetadata> {
    const baseUrl = (this.configuredBaseUrl ?? getEnv().JIKAN_BASE_URL).replace(/\/$/, "");
    let lastError: unknown;
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetcher(`${baseUrl}/anime/${malId}`, {
          headers: { Accept: "application/json", "User-Agent": "AuraPlay-API/0.1" },
          signal: AbortSignal.timeout(this.timeoutMs),
          cache: "no-store",
        });
        if (response.ok) {
          const parsed = jikanAnimeResponseSchema.safeParse(await response.json());
          if (!parsed.success) throw new ExternalApiError("JIKAN_INVALID_RESPONSE", "Jikan retornou dados em formato inesperado.", undefined, { cause: parsed.error });
          const anime = parsed.data.data;
          return {
            malId: anime.mal_id,
            titleEnglish: anime.title_english,
            titles: anime.titles,
            synopsis: anime.synopsis,
            imageUrl: anime.images.webp.large_image_url ?? anime.images.jpg.large_image_url ?? anime.images.webp.image_url ?? anime.images.jpg.image_url,
            durationMinutes: parseDurationMinutes(anime.duration),
          };
        }

        const error = new ExternalApiError("JIKAN_HTTP_ERROR", `Jikan respondeu com HTTP ${response.status}.`, response.status);
        if (!isRetryableStatus(response.status) || attempt === this.maxAttempts - 1) throw error;
        lastError = error;
        await this.sleep(retryDelayMs(attempt, response.headers.get("retry-after")));
      } catch (error) {
        if (error instanceof ExternalApiError) throw error;
        lastError = error;
        if (attempt === this.maxAttempts - 1) break;
        await this.sleep(retryDelayMs(attempt, null));
      }
    }
    throw new ExternalApiError("JIKAN_UNAVAILABLE", "Jikan temporariamente indisponível.", undefined, { cause: lastError });
  }
}
