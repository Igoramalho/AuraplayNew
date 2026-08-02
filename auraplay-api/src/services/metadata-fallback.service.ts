import { ExternalApiError } from "../lib/http/errors";
import type { AniListMedia } from "../lib/anilist/types";
import { JikanClient } from "../lib/jikan/client";
import { getAniListSources, mergeJikanMetadata, needsJikanFallback } from "../lib/jikan/mapper";
import type { MetadataEnrichmentResult } from "../lib/jikan/types";

export class MetadataFallbackService {
  constructor(private readonly jikan: JikanClient = new JikanClient()) {}

  async enrich(media: AniListMedia): Promise<MetadataEnrichmentResult<AniListMedia>> {
    if (!needsJikanFallback(media) || !media.idMal) {
      return { value: media, usedFallback: false, enrichedFields: [], sources: getAniListSources(media) };
    }

    try {
      return mergeJikanMetadata(media, await this.jikan.getAnimeByMalId(media.idMal));
    } catch (error) {
      const fallbackErrorCode = error instanceof ExternalApiError ? error.code : "JIKAN_UNAVAILABLE";
      return { value: media, usedFallback: false, enrichedFields: [], sources: getAniListSources(media), fallbackErrorCode };
    }
  }
}
