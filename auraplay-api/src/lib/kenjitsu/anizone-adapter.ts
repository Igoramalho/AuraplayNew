import type { EpisodeProvider } from "@/lib/provider/interface";
import type { ProviderAnimeQuery, ProviderEpisodesRequest, ProviderPageRequest, ProviderPlaybackRequest, ProviderSource } from "@/lib/provider/types";
import { animeDetails, animeMatch, catalogItem, defaultSeason, health, offsetFromCursor, providerEpisode } from "./adapter-utils";
import { KenjitsuClient } from "./client";
import { encodeSourceChoice, mapPlayback } from "./mapper";
import { animeDetailsSchema, anizoneRecentSchema, anizoneSearchSchema, playbackSchema } from "./schemas";

export class AnizoneAdapter implements EpisodeProvider {
  readonly key = "anizone";
  constructor(private readonly client: KenjitsuClient) {}

  async getCatalog(request: ProviderPageRequest = {}) {
    const payload = await this.client.get("/api/anizone/anime/recent", anizoneRecentSchema);
    const offset = offsetFromCursor(request.cursor);
    const selected = payload.recentlyAdded.slice(offset, offset + (request.limit ?? 20));
    const items = selected.map((item) => catalogItem(this.key, item));
    const hasMore = offset + selected.length < payload.recentlyAdded.length;
    return { items, nextCursor: hasMore ? String(offset + selected.length) : null, hasMore };
  }

  async findAnime(query: ProviderAnimeQuery) {
    const title = query.titles.find(Boolean);
    if (!title) return [];
    const payload = await this.client.get(`/api/anizone/anime/search?q=${encodeURIComponent(title)}`, anizoneSearchSchema);
    return payload.data.map((item) => animeMatch(this.key, item, {}));
  }

  async getAnimeDetails(reference: { providerAnimeId: string }) {
    const payload = await this.client.get(`/api/anizone/anime/${encodeURIComponent(reference.providerAnimeId)}`, animeDetailsSchema);
    return animeDetails(this.key, payload.data);
  }

  async getSeasons(reference: { providerAnimeId: string }) {
    return [defaultSeason(this.key, reference.providerAnimeId)];
  }

  async getEpisodes(request: ProviderEpisodesRequest) {
    const payload = await this.client.get(`/api/anizone/anime/${encodeURIComponent(request.providerAnimeId)}`, animeDetailsSchema);
    const defaultSource: ProviderSource = {
      providerKey: this.key,
      providerSourceId: encodeSourceChoice("SUB", null),
      server: null,
      language: null,
      audioType: "SUB",
      quality: null,
      available: true,
    };
    const offset = offsetFromCursor(request.cursor);
    const selected = payload.providerEpisodes.slice(offset, offset + (request.limit ?? 20));
    const items = selected.map((item, index) =>
      providerEpisode(this.key, request.providerAnimeId, item, offset + index, [defaultSource]),
    );
    const hasMore = offset + selected.length < payload.providerEpisodes.length;
    return { items, nextCursor: hasMore ? String(offset + selected.length) : null, hasMore };
  }

  async getPlayback(request: ProviderPlaybackRequest) {
    const payload = await this.client.get(`/api/anizone/sources/${encodeURIComponent(request.providerEpisodeId)}`, playbackSchema);
    return mapPlayback(payload, request.providerSourceId, "SUB");
  }

  healthCheck() {
    return health(this.client, this.key, "/api/anizone/anime/recent", anizoneRecentSchema);
  }
}
