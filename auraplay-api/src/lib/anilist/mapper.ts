import type { AnimeRelationInsert, AnimeTitleInsert, AnimeUpsert } from "@/lib/supabase/repositories/anime.repository";
import type { AniListFuzzyDate, AniListMedia } from "@/lib/anilist/types";

export function normalizeTitle(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function mapDate(value: AniListFuzzyDate): string | null {
  if (!value.year || !value.month || !value.day) return null;
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day));
  if (date.getUTCFullYear() !== value.year || date.getUTCMonth() !== value.month - 1 || date.getUTCDate() !== value.day) return null;
  return date.toISOString().slice(0, 10);
}

export function mapAniListAnime(media: AniListMedia): AnimeUpsert {
  const preferredTitle = media.title.english ?? media.title.romaji ?? media.title.native ?? `AniList #${media.id}`;
  return {
    anilist_id: media.id,
    mal_id: media.idMal,
    title_romaji: media.title.romaji,
    title_english: media.title.english,
    title_native: media.title.native,
    preferred_title: preferredTitle,
    description: media.description,
    cover_url: media.coverImage.extraLarge ?? media.coverImage.large,
    banner_url: media.bannerImage,
    average_score: media.averageScore,
    popularity: media.popularity,
    trending: media.trending,
    genres: media.genres,
    format: media.format,
    status: media.status,
    season: media.season,
    season_year: media.seasonYear,
    start_date: mapDate(media.startDate),
    end_date: mapDate(media.endDate),
    expected_episode_count: media.episodes,
    next_airing_episode: media.nextAiringEpisode?.episode ?? null,
    next_airing_at: media.nextAiringEpisode ? new Date(media.nextAiringEpisode.airingAt * 1_000).toISOString() : null,
    last_metadata_sync_at: new Date().toISOString(),
  };
}

export function mapAniListTitles(media: AniListMedia, animeId: string): AnimeTitleInsert[] {
  const candidates = [
    { title: media.title.romaji, language: "ja-Latn", title_type: "ROMAJI" },
    { title: media.title.english, language: "en", title_type: "ENGLISH" },
    { title: media.title.native, language: "ja", title_type: "NATIVE" },
    ...media.synonyms.map((title) => ({ title, language: "und", title_type: "SYNONYM" })),
  ];
  const unique = new Map<string, AnimeTitleInsert>();
  for (const candidate of candidates) {
    if (!candidate.title?.trim()) continue;
    const normalizedTitle = normalizeTitle(candidate.title);
    if (!normalizedTitle) continue;
    const key = `${normalizedTitle}:${candidate.language}:${candidate.title_type}`;
    unique.set(key, { anime_id: animeId, title: candidate.title.trim(), normalized_title: normalizedTitle, language: candidate.language, title_type: candidate.title_type });
  }
  return [...unique.values()];
}

export function mapAniListRelations(media: AniListMedia, animeId: string): AnimeRelationInsert[] {
  const unique = new Map<string, AnimeRelationInsert>();
  for (const edge of media.relations.edges) {
    if (edge.node.id === media.id) continue;
    const key = `${edge.node.id}:${edge.relationType}`;
    unique.set(key, { anime_id: animeId, related_anilist_id: edge.node.id, relation_type: edge.relationType });
  }
  return [...unique.values()];
}
