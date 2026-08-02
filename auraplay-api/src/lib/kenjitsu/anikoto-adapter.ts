import type { EpisodeProvider } from "@/lib/provider/interface";
import type { ProviderAnimeQuery, ProviderEpisodesRequest, ProviderPageRequest, ProviderPlaybackRequest } from "@/lib/provider/types";
import { KenjitsuClient } from "./client";
import { animeDetails, animeMatch, catalogItem, defaultSeason, health, offsetFromCursor, pageFromCursor, providerEpisode, serverSources } from "./adapter-utils";
import { decodeSourceChoice, mapPlayback } from "./mapper";
import { animeDetailsSchema, anikotoServersSchema, catalogAnimeSchema, paginatedSchema, playbackSchema } from "./schemas";

const listSchema = paginatedSchema(catalogAnimeSchema);

export class AnikotoAdapter implements EpisodeProvider {
  readonly key = "anikoto";
  constructor(private readonly client: KenjitsuClient) {}

  async getCatalog(request: ProviderPageRequest = {}) {
    const page = pageFromCursor(request.cursor);
    const payload = await this.client.get(`/api/anikoto/anime/releasing?page=${page}`, listSchema);
    const items = payload.data.slice(0, request.limit ?? 20).map((item) => catalogItem(this.key, item));
    return { items, nextCursor: payload.hasNextPage ? String(page + 1) : null, hasMore: payload.hasNextPage };
  }

  async findAnime(query: ProviderAnimeQuery) {
    const title = query.titles.find(Boolean);
    if (!title) return [];
    const payload = await this.client.get(`/api/anikoto/anime/search?q=${encodeURIComponent(title)}&page=1`, listSchema);
    return payload.data.map((item) => animeMatch(this.key, item, {}));
  }

  async getAnimeDetails(reference: { providerAnimeId: string }) {
    const payload = await this.client.get(`/api/anikoto/anime/${encodeURIComponent(reference.providerAnimeId)}`, animeDetailsSchema);
    return animeDetails(this.key, payload.data);
  }

  async getSeasons(reference: { providerAnimeId: string }) {
    return [defaultSeason(this.key, reference.providerAnimeId)];
  }

  async getEpisodes(request: ProviderEpisodesRequest) {
    const payload = await this.client.get(`/api/anikoto/anime/${encodeURIComponent(request.providerAnimeId)}`, animeDetailsSchema);
    const offset = offsetFromCursor(request.cursor);
    const limit = request.limit ?? 20;
    const selected = payload.providerEpisodes.slice(offset, offset + limit);
    const items = await Promise.all(selected.map(async (item, index) => {
      const id = item.id ?? item.episodeId ?? "";
      const servers = await this.client.get(`/api/anikoto/episode/${encodeURIComponent(id)}/servers`, anikotoServersSchema);
      return providerEpisode(this.key, request.providerAnimeId, item, offset + index, serverSources(this.key, servers.data));
    }));
    const hasMore = offset + selected.length < payload.providerEpisodes.length;
    return { items, nextCursor: hasMore ? String(offset + selected.length) : null, hasMore };
  }

  async getPlayback(request: ProviderPlaybackRequest) {
    const choice = decodeSourceChoice(request.providerSourceId);
    const query = new URLSearchParams({ version: choice.audioType.toLowerCase() });
    if (choice.server) query.set("server", choice.server);
    const payload = await this.client.get(`/api/anikoto/sources/${encodeURIComponent(request.providerEpisodeId)}?${query}`, playbackSchema);
    return mapPlayback(payload, request.providerSourceId, choice.audioType);
  }

  healthCheck() {
    return health(this.client, this.key, "/api/anikoto/anime/releasing?page=1", listSchema);
  }
}
