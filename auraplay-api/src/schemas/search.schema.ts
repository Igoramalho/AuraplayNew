import { z } from "zod";

export const searchSchema = z.object({
  q: z.string().trim().min(2, "A consulta deve ter ao menos 2 caracteres.").max(100),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchInput = z.infer<typeof searchSchema>;
