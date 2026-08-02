import type {
  PlaybackSource,
  ProviderAudioType,
  ProviderPlaybackHeaders,
  ProviderPlaybackResult,
  SubtitleTrack,
} from "@/lib/provider/types";

export interface DocumentedPlaybackPayload {
  headers: Record<string, string>;
  data: {
    intro?: { start: number; end: number } | null;
    outro?: { start: number; end: number } | null;
    subtitles: Array<{ url?: string; file?: string; lang?: string; label?: string; kind?: string; default: boolean }>;
    sources: Array<{ url: string; type?: string; isM3u8: boolean; quality?: string }>;
    tracks?: Array<{ url: string; type: string }>;
    posterImage?: string;
  };
}

export function encodeSourceChoice(audioType: ProviderAudioType, server: string | null): string {
  return `${audioType.toLowerCase()}:${encodeURIComponent(server ?? "default")}`;
}

export function decodeSourceChoice(value: string): { audioType: ProviderAudioType; server: string | null } {
  const separator = value.indexOf(":");
  const version = separator >= 0 ? value.slice(0, separator).toUpperCase() : value.toUpperCase();
  const encodedServer = separator >= 0 ? value.slice(separator + 1) : "default";
  const audioType: ProviderAudioType = version === "DUB" || version === "RAW" || version === "MULTI" ? version : "SUB";
  const decoded = decodeURIComponent(encodedServer);
  return { audioType, server: decoded === "default" ? null : decoded };
}

function normalizeSubtitles(items: DocumentedPlaybackPayload["data"]["subtitles"]): SubtitleTrack[] {
  return items.map((item) => ({
    url: item.url ?? item.file ?? "",
    language: item.lang ?? null,
    label: item.label ?? null,
    kind: item.kind ?? null,
    default: item.default,
  }));
}

function qualityScore(value: string | null): number {
  const match = value?.match(/\d+/);
  return match ? Number(match[0]) : -1;
}

function selectSourceId(sources: PlaybackSource[]): string {
  const selected = [...sources].sort((left, right) =>
    qualityScore(right.quality) - qualityScore(left.quality) || left.sourceId.localeCompare(right.sourceId),
  )[0];
  if (!selected) throw new Error("Playback sem fonte resolvida.");
  return selected.sourceId;
}

export function mapPlayback(
  payload: DocumentedPlaybackPayload,
  providerSourceId: string,
  audioType: ProviderAudioType,
  language: string | null = null,
): ProviderPlaybackResult {
  const headers: ProviderPlaybackHeaders = payload.headers;
  const subtitleTracks = normalizeSubtitles(payload.data.subtitles);
  const intro = payload.data.intro ?? null;
  const outro = payload.data.outro ?? null;
  const sources: PlaybackSource[] = payload.data.sources.map((source, index) => ({
    sourceId: `${providerSourceId}:resolved:${index + 1}`,
    url: source.url,
    mimeType: source.type ?? null,
    type: source.type ?? null,
    headers,
    isM3u8: source.isM3u8,
    quality: source.quality ?? null,
    audioType,
    language,
    subtitleTracks,
    intro,
    outro,
  }));
  const selectedSourceId = selectSourceId(sources);
  const selected = sources.find((source) => source.sourceId === selectedSourceId);
  if (!selected) throw new Error("Fonte selecionada não pertence ao playback.");

  return {
    url: selected.url,
    expiresAt: null,
    mimeType: selected.mimeType,
    selectedSourceId,
    sources,
    headers,
    subtitleTracks,
    intro,
    outro,
    selectedAudioType: audioType,
    audioLanguage: language,
    posterUrl: payload.data.posterImage ?? null,
    auxiliaryTracks: payload.data.tracks ?? [],
    qualities: [...new Set(sources.map((source) => source.quality).filter((quality): quality is string => Boolean(quality)))],
  };
}
