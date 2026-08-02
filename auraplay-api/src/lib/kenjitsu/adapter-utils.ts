import type {
  ProviderAnimeDetails,
  ProviderAnimeMatch,
  ProviderCatalogAnime,
  ProviderEpisode,
  ProviderExternalIds,
  ProviderHealthResult,
  ProviderSeason,
  ProviderSource,
} from "@/lib/provider/types";
import type { KenjitsuClient } from "./client";
import type { z } from "zod";
import { encodeSourceChoice } from "./mapper";
import type { catalogAnimeSchema, providerEpisodeSchema, serverSchema } from "./schemas";

type CatalogItem = z.infer<typeof catalogAnimeSchema>;
type EpisodeItem = z.infer<typeof providerEpisodeSchema>;
type ServerItem = z.infer<typeof serverSchema>;

export const DEFAULT_SEASON_ID = "default";

export function pageFromCursor(cursor?: string): number {
  const page = Number(cursor ?? "1");
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function offsetFromCursor(cursor?: string): number {
  const offset = Number(cursor ?? "0");
  return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
}

export function catalogItem(providerKey: string, item: CatalogItem): ProviderCatalogAnime {
  const year = typeof item.releaseDate === "number" ? item.releaseDate : Number(item.releaseDate?.match(/\d{4}/)?.[0]);
  return {
    providerKey,
    providerAnimeId: item.id,
    title: item.name,
    alternativeTitles: item.romaji && item.romaji !== item.name ? [item.romaji] : [],
    externalIds: {},
    format: item.type ?? null,
    year: Number.isFinite(year) ? year : null,
    available: true,
  };
}

export function animeMatch(providerKey: string, item: CatalogItem, queryIds: ProviderExternalIds): ProviderAnimeMatch {
  return {
    providerKey,
    providerAnimeId: item.id,
    title: item.name,
    externalIds: queryIds,
    confidence: 0.5,
    matchMethod: "METADATA",
  };
}

export function animeDetails(providerKey: string, data: CatalogItem & {
  anilistId?: number | null; malId?: number | null; synopsis?: string | null; coverImage?: string | null;
  totalEpisodes?: number | null; altnames?: string | null; japanese?: string | null;
}): ProviderAnimeDetails {
  const base = catalogItem(providerKey, data);
  return {
    ...base,
    alternativeTitles: [data.romaji, data.altnames, data.japanese].filter((title): title is string => Boolean(title && title !== data.name)),
    externalIds: { anilistId: data.anilistId ?? undefined, malId: data.malId ?? undefined },
    description: data.synopsis ?? null,
    coverUrl: data.coverImage ?? null,
    episodeCount: data.totalEpisodes ?? null,
    languages: [],
  };
}

export function defaultSeason(providerKey: string, providerAnimeId: string): ProviderSeason {
  return { providerKey, providerAnimeId, providerSeasonId: DEFAULT_SEASON_ID, number: 1, title: null, displayOrder: 0 };
}

export function episodeId(item: EpisodeItem): string {
  return item.episodeId ?? item.id ?? "";
}

export function episodeNumber(item: EpisodeItem, index: number): number {
  void index;
  return item.episodeNumber ?? item.number ?? Number.NaN;
}

export function providerEpisode(
  providerKey: string,
  providerAnimeId: string,
  item: EpisodeItem,
  index: number,
  sources: ProviderSource[] = [],
): ProviderEpisode {
  const number = episodeNumber(item, index);
  return {
    providerKey,
    providerAnimeId,
    providerSeasonId: DEFAULT_SEASON_ID,
    providerEpisodeId: episodeId(item),
    number,
    absoluteNumber: Number.isInteger(number) ? number : null,
    title: item.title ?? null,
    description: item.description ?? item.teaser ?? null,
    durationSeconds: null,
    thumbnailUrl: item.thumbnail ?? null,
    airedAt: item.airDate ?? null,
    audioType: "SUB",
    language: null,
    available: sources.length > 0,
    sources,
  };
}

export function serverSources(providerKey: string, groups: { sub: ServerItem[]; dub: ServerItem[]; raw: ServerItem[] }): ProviderSource[] {
  return (["sub", "dub", "raw"] as const).flatMap((version) => groups[version].map((server) => ({
    providerSourceId: encodeSourceChoice(version.toUpperCase() as "SUB" | "DUB" | "RAW", server.serverName),
    providerKey,
    server: server.serverName,
    language: null,
    audioType: version.toUpperCase() as "SUB" | "DUB" | "RAW",
    quality: null,
    available: true,
  })));
}

export async function health(client: KenjitsuClient, providerKey: string, path: string, schema: z.ZodType): Promise<ProviderHealthResult> {
  const startedAt = Date.now();
  try {
    await client.get(path, schema);
    return { providerKey, status: "ok", checkedAt: new Date().toISOString(), latencyMs: Date.now() - startedAt };
  } catch {
    return { providerKey, status: "error", checkedAt: new Date().toISOString(), latencyMs: Date.now() - startedAt, errorCode: "PROVIDER_UNAVAILABLE" };
  }
}
