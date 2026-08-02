export type ProviderAudioType = "SUB" | "DUB" | "RAW" | "MULTI";

export interface ProviderPageRequest {
  cursor?: string;
  limit?: number;
}

export interface ProviderExternalIds {
  anilistId?: number;
  malId?: number;
}

export interface ProviderAnimeReference {
  providerKey: string;
  providerAnimeId: string;
}

export interface ProviderSeasonReference extends ProviderAnimeReference {
  providerSeasonId: string;
}

export interface ProviderEpisodeReference extends ProviderSeasonReference {
  providerEpisodeId: string;
}

export interface ProviderCatalogAnime extends ProviderAnimeReference {
  title: string;
  alternativeTitles: string[];
  externalIds: ProviderExternalIds;
  format: string | null;
  year: number | null;
  available: boolean;
}

export interface ProviderCatalogResult {
  items: ProviderCatalogAnime[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ProviderAnimeQuery {
  externalIds: ProviderExternalIds;
  titles: string[];
  format?: string | null;
  year?: number | null;
  season?: string | null;
  expectedEpisodeCount?: number | null;
}

export interface ProviderAnimeMatch extends ProviderAnimeReference {
  title: string;
  externalIds: ProviderExternalIds;
  confidence: number;
  matchMethod: "PROVIDER_ID" | "ANILIST_ID" | "MAL_ID" | "METADATA";
}

export interface ProviderAnimeDetails extends ProviderCatalogAnime {
  description: string | null;
  coverUrl: string | null;
  episodeCount: number | null;
  languages: string[];
}

export interface ProviderSeason extends ProviderSeasonReference {
  number: number;
  title: string | null;
  displayOrder: number;
}

export interface ProviderEpisode extends ProviderEpisodeReference {
  number: number;
  absoluteNumber: number | null;
  title: string | null;
  description: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  airedAt: string | null;
  audioType: ProviderAudioType;
  language: string | null;
  available: boolean;
  sources: ProviderSource[];
}

export interface ProviderSource {
  /**
   * Stable provider identifier persisted for later playback resolution.
   * Video/subtitle URLs, headers, cookies, tokens and signatures never belong here.
   */
  providerSourceId: string;
  providerKey?: string;
  server: string | null;
  language: string | null;
  audioType: ProviderAudioType;
  quality: string | null;
  available: boolean;
}

export interface ProviderEpisodesRequest extends ProviderSeasonReference, ProviderPageRequest {}

export interface ProviderEpisodesResult {
  items: ProviderEpisode[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ProviderPlaybackRequest extends ProviderEpisodeReference {
  providerSourceId: string;
}

export type ProviderPlaybackHeaders = Readonly<Record<string, string>>;

export interface ProviderPlaybackRange {
  start: number;
  end: number;
}

/** A normalized, playback-only subtitle. It is never persisted. */
export interface SubtitleTrack {
  /** Normalized from either the provider's `url` or `file` field. */
  url: string;
  /** Normalized language when the provider supplies `lang`. */
  language: string | null;
  /** Human-readable label when supplied by the provider. */
  label: string | null;
  kind: string | null;
  default: boolean;
}

export interface ProviderAuxiliaryTrack {
  url: string;
  type: string;
}

/**
 * A source resolved just in time for playback. Unlike ProviderSource, none of
 * these values may be persisted or treated as permanent cache content.
 */
export interface PlaybackSource {
  /** Ephemeral identity used only to select one entry from this playback result. */
  sourceId: string;
  url: string;
  mimeType: string | null;
  type: string | null;
  headers: ProviderPlaybackHeaders;
  isM3u8: boolean;
  quality: string | null;
  audioType: ProviderAudioType | null;
  language: string | null;
  subtitleTracks: SubtitleTrack[];
  intro: ProviderPlaybackRange | null;
  outro: ProviderPlaybackRange | null;
}

export type ProviderResolvedPlaybackSource = PlaybackSource;

export interface ProviderPlaybackResult {
  /** @deprecated Compatibility field for the primary resolved source. */
  url: string;
  expiresAt: string | null;
  /** @deprecated Compatibility field for the primary resolved source. */
  mimeType: string | null;
  /** Explicitly identifies one existing item in sources; never inferred by array position. */
  selectedSourceId: string;
  sources: PlaybackSource[];
  headers?: ProviderPlaybackHeaders;
  subtitleTracks?: SubtitleTrack[];
  intro?: ProviderPlaybackRange | null;
  outro?: ProviderPlaybackRange | null;
  selectedAudioType?: ProviderAudioType | null;
  audioLanguage?: string | null;
  posterUrl?: string | null;
  auxiliaryTracks?: ProviderAuxiliaryTrack[];
  qualities?: string[];
}

export type ProviderHealthStatus = "ok" | "degraded" | "error" | "not_configured";

export interface ProviderHealthResult {
  providerKey: string | null;
  status: ProviderHealthStatus;
  checkedAt: string;
  latencyMs: number | null;
  errorCode?: string;
}
