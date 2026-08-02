import { z } from "zod";

export const syncRequestSchema = z.object({
  cursor: z.string().trim().min(1).max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  force: z.boolean().default(false),
});

export type SyncRequest = z.infer<typeof syncRequestSchema>;

const episodeTargetSchema = z.object({
  providerKey: z.string().trim().min(1).max(100),
  providerAnimeId: z.string().trim().min(1).max(300),
  providerSeasonId: z.string().trim().min(1).max(300),
});

export const episodeSyncRequestSchema = syncRequestSchema.extend({ target: episodeTargetSchema.optional() });
export const syncAllRequestSchema = syncRequestSchema.extend({ episodeTarget: episodeTargetSchema.optional() });

export type EpisodeSyncRequest = z.infer<typeof episodeSyncRequestSchema>;
export type SyncAllRequest = z.infer<typeof syncAllRequestSchema>;
