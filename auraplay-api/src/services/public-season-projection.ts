import type { EpisodeRow, EpisodeSourceRow, SeasonRow } from "@/lib/supabase/database.types";

const TECHNICAL_SEASON_TITLE = "Agrupamento técnico local";

export interface CanonicalSeasonGroup {
  key: string;
  number: number;
  preferred: SeasonRow;
  seasons: SeasonRow[];
  title: string | null;
}

export interface EpisodePresentationCandidate {
  episode: EpisodeRow;
  season: SeasonRow;
  sources: EpisodeSourceRow[];
}

function normalizeSupportingTitle(value: string | null): string | null {
  const normalized = value?.normalize("NFKC").trim().toLocaleLowerCase("und").replace(/\s+/g, " ");
  return normalized || null;
}

function isEquivalentTechnicalSeason(season: SeasonRow): boolean {
  return season.provider_season_id === "default" && season.title?.trim() === TECHNICAL_SEASON_TITLE;
}

function canonicalSeasonKey(season: SeasonRow): string {
  if (isEquivalentTechnicalSeason(season)) {
    return `${season.anime_id}:technical-default:${season.season_number}`;
  }
  return `${season.anime_id}:persisted:${season.id}`;
}

function providerRank(providerKey: string, providerOrder: readonly string[]): number {
  const rank = providerOrder.indexOf(providerKey);
  return rank === -1 ? providerOrder.length : rank;
}

function compareProviders(left: string, right: string, providerOrder: readonly string[]): number {
  return providerRank(left, providerOrder) - providerRank(right, providerOrder) || left.localeCompare(right, "en");
}

function publicSeasonTitle(season: SeasonRow): string | null {
  const title = season.title?.trim();
  return !title || title === TECHNICAL_SEASON_TITLE ? `Temporada ${season.season_number}` : title;
}

export function projectCanonicalSeasons(seasons: readonly SeasonRow[], providerOrder: readonly string[]): CanonicalSeasonGroup[] {
  const groups = new Map<string, SeasonRow[]>();
  for (const season of seasons) {
    const key = canonicalSeasonKey(season);
    const group = groups.get(key) ?? [];
    group.push(season);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const ordered = [...group].sort((left, right) =>
        compareProviders(left.provider_key, right.provider_key, providerOrder) || left.id.localeCompare(right.id),
      );
      const preferred = ordered[0];
      return { key, number: preferred.season_number, preferred, seasons: ordered, title: publicSeasonTitle(preferred) };
    })
    .sort((left, right) => left.number - right.number || left.preferred.display_order - right.preferred.display_order);
}

function episodesAreEquivalent(left: EpisodePresentationCandidate, right: EpisodePresentationCandidate): boolean {
  if (left.season.provider_key === right.season.provider_key) return false;
  if (left.episode.episode_number !== right.episode.episode_number) return false;
  if (left.episode.absolute_number !== null && right.episode.absolute_number !== null
    && left.episode.absolute_number !== right.episode.absolute_number) return false;
  const leftTitle = normalizeSupportingTitle(left.episode.title);
  const rightTitle = normalizeSupportingTitle(right.episode.title);
  return !leftTitle || !rightTitle || leftTitle === rightTitle;
}

export function projectCanonicalEpisodes(
  season: CanonicalSeasonGroup,
  candidates: readonly EpisodePresentationCandidate[],
  providerOrder: readonly string[],
): EpisodePresentationCandidate[] {
  const seasonIds = new Set(season.seasons.map((item) => item.id));
  const buckets: EpisodePresentationCandidate[][] = [];
  const relevant = candidates
    .filter((candidate) => seasonIds.has(candidate.episode.season_id))
    .sort((left, right) => left.episode.episode_number - right.episode.episode_number
      || compareProviders(left.season.provider_key, right.season.provider_key, providerOrder)
      || left.episode.id.localeCompare(right.episode.id));

  for (const candidate of relevant) {
    const equivalent = buckets.find((bucket) => bucket.every((existing) => episodesAreEquivalent(existing, candidate)));
    if (equivalent) equivalent.push(candidate);
    else buckets.push([candidate]);
  }

  return buckets.map((bucket) => selectCanonicalEpisode(bucket, providerOrder))
    .sort((left, right) => left.episode.episode_number - right.episode.episode_number
      || left.episode.id.localeCompare(right.episode.id));
}

export function selectCanonicalEpisode(
  candidates: readonly EpisodePresentationCandidate[],
  providerOrder: readonly string[],
): EpisodePresentationCandidate {
  return [...candidates].sort((left, right) => {
    const leftPlayable = left.episode.available && left.sources.length > 0;
    const rightPlayable = right.episode.available && right.sources.length > 0;
    if (leftPlayable !== rightPlayable) return leftPlayable ? -1 : 1;
    return compareProviders(left.season.provider_key, right.season.provider_key, providerOrder)
      || left.episode.id.localeCompare(right.episode.id);
  })[0];
}
