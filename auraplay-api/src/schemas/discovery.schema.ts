import { z } from "zod";

export const animeImportSchema = z.object({
  anilistId: z.coerce.number().int().positive(),
});

export const animeEpisodeDiscoverySyncSchema = z.object({
  providerKey: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
