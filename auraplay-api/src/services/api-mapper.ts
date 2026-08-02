import type { AnimeRow } from "@/lib/supabase/database.types";

export function mapAnimeCard(anime: AnimeRow) {
  return {
    id: anime.id,
    anilistId: anime.anilist_id,
    malId: anime.mal_id,
    title: anime.preferred_title,
    alternativeTitles: [anime.title_romaji, anime.title_english, anime.title_native].filter((value): value is string => Boolean(value)),
    coverUrl: anime.cover_url,
    bannerUrl: anime.banner_url,
    averageScore: anime.average_score,
    year: anime.season_year,
    season: anime.season,
    status: anime.status,
    expectedEpisodeCount: anime.expected_episode_count,
    availableEpisodeCount: anime.available_episode_count,
    playbackStatus: anime.playback_status,
    nextEpisode: anime.next_airing_episode ? { number: anime.next_airing_episode, airingAt: anime.next_airing_at } : null,
  };
}
