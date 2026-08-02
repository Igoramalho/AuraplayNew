import { z } from "zod";

const fuzzyDate = z.object({ year: z.number().int().nullable(), month: z.number().int().nullable(), day: z.number().int().nullable() });
const title = z.object({ romaji: z.string().nullable(), english: z.string().nullable(), native: z.string().nullable() });

export const aniListMediaSchema = z.object({
  id: z.number().int().positive(),
  idMal: z.number().int().positive().nullable(),
  title,
  synonyms: z.array(z.string()),
  description: z.string().nullable(),
  coverImage: z.object({ extraLarge: z.string().nullable(), large: z.string().nullable(), color: z.string().nullable() }),
  bannerImage: z.string().nullable(),
  averageScore: z.number().int().min(0).max(100).nullable(),
  popularity: z.number().int().nonnegative().nullable(),
  trending: z.number().int().nonnegative().nullable(),
  genres: z.array(z.string()),
  format: z.string().nullable(),
  status: z.string().nullable(),
  season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]).nullable(),
  seasonYear: z.number().int().nullable(),
  startDate: fuzzyDate,
  endDate: fuzzyDate,
  episodes: z.number().int().nonnegative().nullable(),
  duration: z.number().int().positive().nullable(),
  countryOfOrigin: z.string().nullable(),
  isAdult: z.boolean(),
  relations: z.object({ edges: z.array(z.object({
    relationType: z.string(),
    node: z.object({ id: z.number().int().positive(), idMal: z.number().int().positive().nullable(), format: z.string().nullable(), title }),
  })) }),
  nextAiringEpisode: z.object({ episode: z.number().int().positive(), airingAt: z.number().int().positive() }).nullable(),
});

const page = z.object({ media: z.array(aniListMediaSchema) });
export const aniListErrorResponseSchema = z.object({
  errors: z.array(z.object({ message: z.string(), status: z.number().optional() })).min(1),
});
export const homeCatalogResponseSchema = z.object({
  data: z.object({ featured: page, popularSeason: page, recentReleases: page, airingNow: page }),
  errors: z.array(z.object({ message: z.string(), status: z.number().optional() })).optional(),
});
export const animeByIdResponseSchema = z.object({
  data: z.object({ anime: aniListMediaSchema.nullable() }),
  errors: z.array(z.object({ message: z.string(), status: z.number().optional() })).optional(),
});
export const animeSearchResponseSchema = z.object({
  data: z.object({
    page: z.object({
      pageInfo: z.object({
        currentPage: z.number().int().positive(),
        lastPage: z.number().int().nonnegative(),
        hasNextPage: z.boolean(),
        perPage: z.number().int().positive(),
        total: z.number().int().nonnegative(),
      }),
      media: z.array(aniListMediaSchema),
    }),
  }),
  errors: z.array(z.object({ message: z.string(), status: z.number().optional() })).optional(),
});
