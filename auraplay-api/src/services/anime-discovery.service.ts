import type { AniListClient } from "../lib/anilist/client";
import { normalizeTitle } from "../lib/anilist/mapper";
import type { EpisodeProvider } from "../lib/provider/interface";
import { canFallback, ProviderChain } from "../lib/provider/provider-chain";
import type { ProviderAnimeDetails, ProviderAnimeQuery } from "../lib/provider/types";
import type { AnimeRepository } from "../lib/supabase/repositories/anime.repository";
import type { ProviderPersistenceRepository } from "../lib/supabase/repositories/provider-persistence.repository";
import { ApiHttpError } from "../lib/http/response";
import type { AnimeMetadataService } from "./anime-metadata.service";
import type { EpisodeSyncService } from "./episode-sync.service";
import type { ProviderCatalogPersistenceSink } from "./provider-persistence.sink";

type AnimeReadPort = Pick<AnimeRepository, "findById" | "listTitles">;
type ProviderReadPort = Pick<ProviderPersistenceRepository, "findProviderAnimeByAnimeId">;
type MetadataPort = Pick<AnimeMetadataService, "persist">;
type CatalogSinkPort = Pick<ProviderCatalogPersistenceSink, "persist">;
type EpisodeSyncPort = Pick<EpisodeSyncService, "sync">;

function confidence(details: ProviderAnimeDetails, query: ProviderAnimeQuery): { value: number; method: "ANILIST_ID" | "MAL_ID" | "METADATA" } | null {
  if (details.externalIds.anilistId !== undefined) {
    return details.externalIds.anilistId === query.externalIds.anilistId ? { value: 1, method: "ANILIST_ID" } : null;
  }
  if (details.externalIds.malId !== undefined) {
    return details.externalIds.malId === query.externalIds.malId ? { value: 0.98, method: "MAL_ID" } : null;
  }
  const titles = new Set(query.titles.map(normalizeTitle).filter(Boolean));
  const titleMatches = [details.title, ...details.alternativeTitles].some((title) => titles.has(normalizeTitle(title)));
  const yearMatches = query.year !== null && query.year !== undefined && details.year === query.year;
  const formatMatches = Boolean(query.format && details.format && query.format.toLowerCase() === details.format.toLowerCase());
  return titleMatches && yearMatches && formatMatches ? { value: 0.9, method: "METADATA" } : null;
}

export class AnimeDiscoveryService {
  constructor(
    private readonly aniList: Pick<AniListClient, "getAnimeById">,
    private readonly metadata: MetadataPort,
    private readonly anime: AnimeReadPort,
    private readonly providerAssociations: ProviderReadPort,
    private readonly providers: ProviderChain,
    private readonly catalogSink: CatalogSinkPort,
    private readonly episodeSync: EpisodeSyncPort,
  ) {}

  async importAnime(anilistId: number) {
    const media = await this.aniList.getAnimeById(anilistId);
    if (media.isAdult) throw new ApiHttpError(422, "ADULT_CONTENT_NOT_ALLOWED", "Conteúdo adulto não pode ser importado.");
    const result = await this.metadata.persist(media);
    return {
      animeId: result.animeId,
      operation: result.operation,
      anilistId: media.id,
      malId: media.idMal,
      title: media.title.english ?? media.title.romaji ?? media.title.native ?? `AniList #${media.id}`,
      aliasesProcessed: result.titlesPersisted,
      relationsProcessed: result.relationsPersisted,
    };
  }

  async syncProvider(animeId: string) {
    const anime = await this.anime.findById(animeId);
    if (!anime) throw new ApiHttpError(404, "ANIME_NOT_FOUND", "Anime não encontrado.");
    const titleRows = await this.anime.listTitles(anime.id);
    const query: ProviderAnimeQuery = {
      externalIds: { anilistId: anime.anilist_id, malId: anime.mal_id ?? undefined },
      titles: [...new Set([anime.preferred_title, ...titleRows.map((item) => item.title)])],
      format: anime.format,
      year: anime.season_year,
      season: anime.season,
      expectedEpisodeCount: anime.expected_episode_count,
    };
    let lastError: unknown;
    for (const provider of this.providers.providers) {
      try {
        const matches = await provider.findAnime(query);
        const canonicalTitles = new Set(query.titles.map(normalizeTitle));
        const candidates = matches.filter((match) => canonicalTitles.has(normalizeTitle(match.title))).slice(0, 5);
        const evaluated = (await Promise.all(candidates.map(async (match) => {
          const details = await provider.getAnimeDetails(match);
          const evidence = confidence(details, query);
          return evidence ? { details, evidence } : null;
        }))).filter((item): item is NonNullable<typeof item> => item !== null);
        if (evaluated.length > 1) throw new ApiHttpError(409, "PROVIDER_MATCH_AMBIGUOUS", "Mais de um matching seguro foi encontrado.");
        const selected = evaluated[0];
        if (!selected) continue;
        const persisted = await this.catalogSink.persist([selected.details]);
        if (persisted.skipped > 0 || (persisted.needsReview ?? 0) > 0) {
          throw new ApiHttpError(409, "PROVIDER_MATCH_REQUIRES_REVIEW", "O matching do provider requer revisão.");
        }
        return {
          animeId: anime.id,
          providerKey: provider.key,
          providerAnimeId: selected.details.providerAnimeId,
          matchMethod: selected.evidence.method,
          confidence: selected.evidence.value,
          operation: persisted.created > 0 ? "created" : "updated",
        };
      } catch (error) {
        if (error instanceof ApiHttpError) throw error;
        if (!canFallback(error)) throw error;
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    throw new ApiHttpError(404, "PROVIDER_MATCH_NOT_FOUND", "Nenhum matching seguro foi encontrado.");
  }

  async syncEpisodes(animeId: string, options: { providerKey?: string; cursor?: string; limit: number }) {
    const anime = await this.anime.findById(animeId);
    if (!anime) throw new ApiHttpError(404, "ANIME_NOT_FOUND", "Anime não encontrado.");
    const orderedProviders: EpisodeProvider[] = options.providerKey
      ? this.providers.providers.filter((provider) => provider.key === options.providerKey)
      : [...this.providers.providers];
    if (orderedProviders.length === 0) throw new ApiHttpError(503, "PROVIDER_NOT_CONFIGURED", "Provider não configurado.");
    for (const provider of orderedProviders) {
      const association = await this.providerAssociations.findProviderAnimeByAnimeId(provider.key, anime.id);
      if (!association?.anime_id || !["AUTO_MATCHED", "MATCHED"].includes(association.match_status)) continue;
      return this.episodeSync.sync({
        providerKey: provider.key,
        providerAnimeId: association.provider_anime_id,
        providerSeasonId: "default",
        cursor: options.cursor,
        limit: Math.min(Math.max(options.limit, 1), 100),
      });
    }
    throw new ApiHttpError(409, "PROVIDER_ASSOCIATION_NOT_FOUND", "Nenhuma associação aprovada foi encontrada.");
  }
}
