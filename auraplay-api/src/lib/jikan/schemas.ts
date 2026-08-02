import { z } from "zod";

const nullableUrl = z.url().nullable();
const images = z.object({
  image_url: nullableUrl,
  small_image_url: nullableUrl,
  large_image_url: nullableUrl,
});

export const jikanAnimeResponseSchema = z.object({
  data: z.object({
    mal_id: z.number().int().positive(),
    title_english: z.string().nullable(),
    titles: z.array(z.object({ type: z.string(), title: z.string().min(1) })),
    synopsis: z.string().nullable(),
    images: z.object({ jpg: images, webp: images }),
    duration: z.string().nullable(),
  }),
});
