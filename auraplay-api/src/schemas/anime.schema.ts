import { z } from "zod";

export const uuidSchema = z.uuid("ID interno inválido.");
export const anilistIdSchema = z.coerce.number().int().positive("AniList ID inválido.");

export const animeIdentifierSchema = z.union([
  uuidSchema.transform((value) => ({ kind: "internal" as const, value })),
  anilistIdSchema.transform((value) => ({ kind: "anilist" as const, value })),
]);
