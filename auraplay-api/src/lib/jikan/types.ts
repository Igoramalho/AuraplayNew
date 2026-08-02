export interface JikanTitle {
  type: string;
  title: string;
}

export interface JikanAnimeMetadata {
  malId: number;
  titleEnglish: string | null;
  titles: JikanTitle[];
  synopsis: string | null;
  imageUrl: string | null;
  durationMinutes: number | null;
}

export type EnrichedField = "coverImage" | "description" | "titleEnglish" | "synonyms" | "duration";

export interface MetadataEnrichmentResult<T> {
  value: T;
  usedFallback: boolean;
  enrichedFields: EnrichedField[];
  sources: Partial<Record<EnrichedField, "ANILIST" | "JIKAN">>;
  fallbackErrorCode?: string;
}
