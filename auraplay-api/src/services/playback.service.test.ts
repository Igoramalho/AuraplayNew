import { describe, expect, it, vi } from "vitest";

import type { EpisodeProvider } from "@/lib/provider/interface";
import { ProviderChain } from "../lib/provider/provider-chain";
import type { ProviderPlaybackResult } from "@/lib/provider/types";
import { PlaybackService } from "./playback.service";

function playbackProvider(key: "anikoto" | "anizone"): EpisodeProvider {
  const result: ProviderPlaybackResult = {
    url: "memory-only",
    expiresAt: null,
    mimeType: null,
    selectedSourceId: `${key}-source`,
    sources: [{ sourceId: `${key}-source`, url: "memory-only", mimeType: null, type: null, headers: {}, isM3u8: false, quality: null, audioType: "SUB", language: null, subtitleTracks: [], intro: null, outro: null }],
  };
  return {
    key,
    healthCheck: vi.fn(async () => ({ providerKey: key, status: "ok" as const, checkedAt: "now", latencyMs: 1 })),
    getCatalog: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    findAnime: vi.fn(async () => []),
    getAnimeDetails: vi.fn(async () => { throw new Error("not used"); }),
    getSeasons: vi.fn(async () => []),
    getEpisodes: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    getPlayback: vi.fn(async () => result),
  };
}

describe("PlaybackService por provider de origem", () => {
  it("seleciona Anizone pela fonte persistida sem enviar IDs ao Anikoto", async () => {
    const anikoto = playbackProvider("anikoto");
    const anizone = playbackProvider("anizone");
    const repository = { getPlaybackContext: vi.fn(async () => ({
      episode: { id: "episode", provider_episode_id: "anizone-episode-id" },
      season: { provider_key: "anizone", provider_anime_id: "naruto-spjuxray", provider_season_id: "default" },
      sources: [{ provider_key: "anizone", provider_source_id: "sub:default" }],
    })) };
    const result = await new PlaybackService(repository as never, new ProviderChain([anikoto, anizone])).getPlayback("episode");
    expect(result.selectedSourceId).toBe("anizone-source");
    expect(anizone.getPlayback).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: "anizone",
      providerAnimeId: "naruto-spjuxray",
      providerEpisodeId: "anizone-episode-id",
    }));
    expect(anikoto.getPlayback).not.toHaveBeenCalled();
  });
});
