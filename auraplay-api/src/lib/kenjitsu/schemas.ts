import { z } from "zod";

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();
const nullableExternalId = z.union([
  z.number().int().positive(),
  z.string().regex(/^\d+$/).transform(Number),
]).nullable().optional();

export const paginatedSchema = <T extends z.ZodType>(item: T) => z.object({
  hasNextPage: z.boolean(),
  currentPage: z.number(),
  lastPage: z.number().nullable().optional(),
  perPage: z.number().optional(),
  totalResults: z.number().optional(),
  data: z.array(item),
});

export const catalogAnimeSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  name: z.string(),
  romaji: z.string().optional(),
  posterImage: z.string().optional(),
  type: z.string().optional(),
  totalEpisodes: nullableNumber,
  releaseDate: z.union([z.string(), z.number()]).optional(),
  genres: z.array(z.string()).optional(),
  status: z.string().optional(),
});

export const providerEpisodeSchema = z.object({
  id: z.string().optional(),
  episodeId: z.string().optional(),
  number: z.number().optional(),
  episodeNumber: z.number().optional(),
  title: nullableString,
  thumbnail: nullableString,
  description: nullableString,
  teaser: nullableString,
  airDate: nullableString,
  filler: z.boolean().optional(),
}).refine((value) => Boolean(value.id ?? value.episodeId), "Episódio sem identificador.");

const animeDetailsDataSchema = catalogAnimeSchema.extend({
  anilistId: nullableExternalId,
  malId: nullableExternalId,
  romaji: z.string().optional(),
  synopsis: nullableString,
  coverImage: nullableString,
  duration: nullableString,
  altnames: nullableString,
  japanese: nullableString,
});

export const animeDetailsSchema = z.object({
  data: animeDetailsDataSchema,
  providerEpisodes: z.array(providerEpisodeSchema),
});

export const serverSchema = z.object({
  serverId: z.union([z.string(), z.number()]).optional(),
  severId: z.union([z.string(), z.number()]).optional(),
  serverName: z.string(),
  mediaId: z.string().optional(),
  eid: z.string().optional(),
});

const serverGroupsSchema = z.object({
  sub: z.array(serverSchema).default([]),
  dub: z.array(serverSchema).default([]),
  raw: z.array(serverSchema).default([]),
  episodeNumber: z.number().optional(),
});

export const anikotoServersSchema = z.object({ data: serverGroupsSchema, episodeNumber: z.number().optional() });
export const animepaheServersSchema = z.object({ data: serverGroupsSchema, download: serverGroupsSchema.optional() });

export const subtitleSchema = z.object({
  url: z.string().optional(),
  file: z.string().optional(),
  lang: z.string().optional(),
  label: z.string().optional(),
  kind: z.string().optional(),
  default: z.boolean().default(false),
}).refine((value) => Boolean(value.url ?? value.file), "Legenda sem URL.");

export const playbackSourceSchema = z.object({
  url: z.string(),
  type: z.string().optional(),
  isM3u8: z.boolean().default(false),
  quality: z.string().optional(),
});

const rangeSchema = z.object({ start: z.number(), end: z.number() });

export const playbackSchema = z.object({
  headers: z.record(z.string(), z.string()).default({}),
  data: z.object({
    intro: rangeSchema.nullable().optional(),
    outro: rangeSchema.nullable().optional(),
    subtitles: z.array(subtitleSchema).default([]),
    sources: z.array(playbackSourceSchema).min(1),
    download: z.string().optional(),
    tracks: z.array(z.object({ url: z.string(), type: z.string() })).optional(),
    posterImage: z.string().optional(),
  }),
});

export const anizoneRecentSchema = z.object({
  data: z.array(providerEpisodeSchema),
  recentlyAdded: z.array(z.object({
    id: z.string(),
    name: z.string(),
    posterImage: z.string().optional(),
  })),
});

export const anizoneSearchSchema = z.object({ data: z.array(catalogAnimeSchema) });
