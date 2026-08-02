import { MemoryCache, type CacheStore } from "../cache/cache";
import type { JikanAnimeMetadata } from "./types";

export const JIKAN_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

export class JikanCache {
  constructor(private readonly store: CacheStore = new MemoryCache()) {}

  get(malId: number): JikanAnimeMetadata | undefined {
    return this.store.get<JikanAnimeMetadata>(`jikan:anime:${malId}`);
  }

  set(malId: number, value: JikanAnimeMetadata): void {
    this.store.set(`jikan:anime:${malId}`, value, JIKAN_CACHE_TTL_MS);
  }
}
