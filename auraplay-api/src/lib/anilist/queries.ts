const MEDIA_FIELDS = /* GraphQL */ `
  fragment AuraPlayMedia on Media {
    id
    idMal
    title { romaji english native }
    synonyms
    description(asHtml: false)
    coverImage { extraLarge large color }
    bannerImage
    averageScore
    popularity
    trending
    genres
    format
    status
    season
    seasonYear
    startDate { year month day }
    endDate { year month day }
    episodes
    duration
    countryOfOrigin
    isAdult
    relations {
      edges {
        relationType(version: 2)
        node { id idMal format title { romaji english native } }
      }
    }
    nextAiringEpisode { episode airingAt }
  }
`;

export const HOME_CATALOG_QUERY = /* GraphQL */ `
  query HomeCatalog($season: MediaSeason!, $seasonYear: Int!, $recentBefore: FuzzyDateInt!, $perPage: Int!) {
    featured: Page(page: 1, perPage: $perPage) {
      media(type: ANIME, isAdult: false, sort: TRENDING_DESC) { ...AuraPlayMedia }
    }
    popularSeason: Page(page: 1, perPage: $perPage) {
      media(type: ANIME, isAdult: false, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) { ...AuraPlayMedia }
    }
    recentReleases: Page(page: 1, perPage: $perPage) {
      media(type: ANIME, isAdult: false, status: RELEASING, startDate_lesser: $recentBefore, sort: START_DATE_DESC) { ...AuraPlayMedia }
    }
    airingNow: Page(page: 1, perPage: $perPage) {
      media(type: ANIME, isAdult: false, status: RELEASING, sort: UPDATED_AT_DESC) { ...AuraPlayMedia }
    }
  }
  ${MEDIA_FIELDS}
`;

export const ANIME_BY_ID_QUERY = /* GraphQL */ `
  query AnimeById($id: Int!) {
    anime: Media(id: $id, type: ANIME) { ...AuraPlayMedia }
  }
  ${MEDIA_FIELDS}
`;

export const ANIME_SEARCH_QUERY = /* GraphQL */ `
  query AnimeSearch($query: String!, $page: Int!, $perPage: Int!) {
    page: Page(page: $page, perPage: $perPage) {
      pageInfo { currentPage lastPage hasNextPage perPage total }
      media(search: $query, type: ANIME, isAdult: false, sort: SEARCH_MATCH) { ...AuraPlayMedia }
    }
  }
  ${MEDIA_FIELDS}
`;
