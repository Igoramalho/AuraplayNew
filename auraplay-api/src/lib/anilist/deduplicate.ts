import type { AniListMedia } from "@/lib/anilist/types";

export function deduplicateByAnilistId(items: AniListMedia[]): AniListMedia[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}
