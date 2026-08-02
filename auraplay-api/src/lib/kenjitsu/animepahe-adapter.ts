import type { EpisodeProvider } from "@/lib/provider/interface";
import { ProviderError } from "../provider/errors";
import type { ProviderAnimeQuery, ProviderCatalogResult, ProviderEpisodesRequest, ProviderPlaybackRequest } from "@/lib/provider/types";
import { animeDetails, animeMatch, defaultSeason, health, offsetFromCursor, providerEpisode, serverSources } from "./adapter-utils";
import { KenjitsuClient } from "./client";
import { decodeSourceChoice, mapPlayback } from "./mapper";
import { animeDetailsSchema, animepaheServersSchema, catalogAnimeSchema, paginatedSchema, playbackSchema, providerEpisodeSchema } from "./schemas";
import { z } from "zod";

const searchSchema = paginatedSchema(catalogAnimeSchema);
const episodesSchema = z.object({ data: z.array(providerEpisodeSchema) });

export class AnimePaheAdapter implements EpisodeProvider {
  readonly key = "animepahe";
  constructor(private readonly client: KenjitsuClient) {}

  async getCatalog(): Promise<ProviderCatalogResult> {
    throw new ProviderError("PROVIDER_UNAVAILABLE", "Animepahe não documenta um endpoint de catálogo de animes.", 501);
  }

  async findAnime(query: ProviderAnimeQuery) {
    const title = query.titles.find(Boolean);
    if (!title) return [];
    const payload = await this.client.get(`/api/animepahe/anime/search?q=${encodeURIComponent(title)}`, searchSchema);
    return payload.data.map((item) => animeMatch(this.key, item, {}));
  }

  async getAnimeDetails(reference: { providerAnimeId: string }) {
    const payload = await this.client.get(`/api/animepahe/anime/${encodeURIComponent(reference.providerAnimeId)}`, animeDetailsSchema);
    return animeDetails(this.key, payload.data);
  }

  async getSeasons(reference: { providerAnimeId: string }) {
    return [defaultSeason(this.key, reference.providerAnimeId)];
  }

  async getEpisodes(request: ProviderEpisodesRequest) {
    const payload = await this.client.get(`/api/animepahe/anime/${encodeURIComponent(request.providerAnimeId)}/episodes`, episodesSchema);
    const offset = offsetFromCursor(request.cursor);
    const limit = request.limit ?? 20;
    const selected = payload.data.slice(offset, offset + limit);
    const items = await Promise.all(selected.map(async (item, index) => {
      const id = item.episodeId ?? item.id ?? "";
      const servers = await this.client.get(`/api/animepahe/episode/${encodeURIComponent(id)}/servers`, animepaheServersSchema);
      return providerEpisode(this.key, request.providerAnimeId, item, offset + index, serverSources(this.key, servers.data));
    }));
    const hasMore = offset + selected.length < payload.data.length;
    return { items, nextCursor: hasMore ? String(offset + selected.length) : null, hasMore };
  }

  async getPlayback(request: ProviderPlaybackRequest) {
    const choice = decodeSourceChoice(request.providerSourceId);
    const payload = await this.client.get(
      `/api/animepahe/sources/${encodeURIComponent(request.providerEpisodeId)}?version=${choice.audioType.toLowerCase()}`,
      playbackSchema,
    );
    return mapPlayback(payload, request.providerSourceId, choice.audioType);
  }

  healthCheck() {
    return health(this.client, this.key, "/api/animepahe/anime/search?q=health", searchSchema);
  }
}
