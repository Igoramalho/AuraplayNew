import type { AniListMedia } from "../anilist/types";
import type { EnrichedField, JikanAnimeMetadata, MetadataEnrichmentResult } from "./types";

function isMissing(value: string | null | undefined): boolean {
  return !value?.trim();
}

export function needsJikanFallback(media: AniListMedia): boolean {
  if (!media.idMal) return false;
  return isMissing(media.description)
    || isMissing(media.title.english)
    || (!media.coverImage.extraLarge && !media.coverImage.large)
    || media.synonyms.length === 0
    || media.duration === null;
}

export function getAniListSources(media: AniListMedia): MetadataEnrichmentResult<AniListMedia>["sources"] {
  const sources: MetadataEnrichmentResult<AniListMedia>["sources"] = {};
  if (!isMissing(media.description)) sources.description = "ANILIST";
  if (!isMissing(media.title.english)) sources.titleEnglish = "ANILIST";
  if (media.coverImage.extraLarge || media.coverImage.large) sources.coverImage = "ANILIST";
  if (media.synonyms.length > 0) sources.synonyms = "ANILIST";
  if (media.duration !== null) sources.duration = "ANILIST";
  return sources;
}

export function mergeJikanMetadata(media: AniListMedia, jikan: JikanAnimeMetadata): MetadataEnrichmentResult<AniListMedia> {
  const enrichedFields: EnrichedField[] = [];
  const sources = getAniListSources(media);
  const value: AniListMedia = {
    ...media,
    title: { ...media.title },
    coverImage: { ...media.coverImage },
    synonyms: [...media.synonyms],
  };

  if (isMissing(value.description) && jikan.synopsis) {
    value.description = jikan.synopsis;
    enrichedFields.push("description");
  }
  if (isMissing(value.title.english) && jikan.titleEnglish) {
    value.title.english = jikan.titleEnglish;
    enrichedFields.push("titleEnglish");
  }
  if (!value.coverImage.extraLarge && !value.coverImage.large && jikan.imageUrl) {
    value.coverImage.large = jikan.imageUrl;
    enrichedFields.push("coverImage");
  }
  if (value.synonyms.length === 0) {
    const canonical = new Set(Object.values(value.title).filter(Boolean).map((title) => title!.toLocaleLowerCase()));
    value.synonyms = [...new Set(jikan.titles.map((title) => title.title.trim()).filter((title) => title && !canonical.has(title.toLocaleLowerCase())))];
    if (value.synonyms.length > 0) enrichedFields.push("synonyms");
  }
  if (value.duration === null && jikan.durationMinutes !== null) {
    value.duration = jikan.durationMinutes;
    enrichedFields.push("duration");
  }

  for (const field of enrichedFields) sources[field] = "JIKAN";
  return { value, usedFallback: enrichedFields.length > 0, enrichedFields, sources };
}
