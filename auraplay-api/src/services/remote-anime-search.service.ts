import { normalizeTitle } from "../lib/anilist/mapper";
import type { AniListClient } from "../lib/anilist/client";

type SearchClient = Pick<AniListClient, "searchAnime">;

export class RemoteAnimeSearchService {
  constructor(private readonly aniList: SearchClient) {}

  async search(input: { q: string; page: number; limit: number }) {
    const result = await this.aniList.searchAnime(input.q, input.page, input.limit);
    return {
      items: result.items.filter((media) => !media.isAdult).map((media) => {
        const titles = [...new Set([
          media.title.english,
          media.title.romaji,
          media.title.native,
          ...media.synonyms,
        ].filter((value): value is string => Boolean(value?.trim())))];
        return {
          anilistId: media.id,
          malId: media.idMal,
          title: media.title.english ?? media.title.romaji ?? media.title.native ?? `AniList #${media.id}`,
          alternativeTitles: titles,
          normalizedTitle: normalizeTitle(titles[0] ?? `AniList ${media.id}`),
          year: media.seasonYear ?? media.startDate.year,
          format: media.format,
          expectedEpisodeCount: media.episodes,
          coverUrl: media.coverImage.extraLarge ?? media.coverImage.large,
          status: media.status,
        };
      }),
      page: result.page,
      limit: result.limit,
      total: result.total,
      hasNextPage: result.hasNextPage,
    };
  }
}
