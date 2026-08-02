import { describe, expect, it, vi } from "vitest";

import { AnikotoAdapter } from "./anikoto-adapter";
import { AnizoneAdapter } from "./anizone-adapter";
import type { KenjitsuClient } from "./client";

function clientWith(resolver: (path: string) => unknown): KenjitsuClient {
  return { get: vi.fn(async (path: string) => resolver(path)) } as unknown as KenjitsuClient;
}

const playback = {
  headers: { Referer: "https://provider.test/" },
  data: { subtitles: [], sources: [{ url: "https://provider.test/video.m3u8", type: "hls", isM3u8: true }] },
};

describe("adapters Kenjitsu", () => {
  it("Anikoto usa somente search, details, servers e sources documentados", async () => {
    const client = clientWith((path) => {
      if (path.startsWith("/api/anikoto/anime/search")) return { hasNextPage: false, currentPage: 1, data: [{ id: "bleach", name: "Bleach" }] };
      if (path === "/api/anikoto/anime/bleach") return { data: { id: "bleach", name: "Bleach" }, providerEpisodes: [{ id: "ep-1", number: 1 }] };
      if (path === "/api/anikoto/episode/ep-1/servers") return { data: { sub: [{ serverId: "1", serverName: "vidstream" }], dub: [], raw: [] } };
      if (path.startsWith("/api/anikoto/sources/ep-1")) return playback;
      throw new Error(`Path inesperado: ${path}`);
    });
    const adapter = new AnikotoAdapter(client);

    await expect(adapter.findAnime({ externalIds: {}, titles: ["Bleach"] })).resolves.toHaveLength(1);
    const episodes = await adapter.getEpisodes({ providerKey: "anikoto", providerAnimeId: "bleach", providerSeasonId: "default", limit: 10 });
    expect(episodes.items[0]).toMatchObject({ providerKey: "anikoto", providerAnimeId: "bleach" });
    expect(episodes.items[0]?.sources[0]?.providerSourceId).toBe("sub:vidstream");
    expect(episodes.items[0]?.sources[0]?.providerKey).toBe("anikoto");
    const result = await adapter.getPlayback({ providerKey: "anikoto", providerAnimeId: "bleach", providerSeasonId: "default", providerEpisodeId: "ep-1", providerSourceId: "sub:vidstream" });
    expect(result.sources?.some((source) => source.sourceId === result.selectedSourceId)).toBe(true);
  });

  it("Anizone resolve playback direto sem inventar endpoint de servidores", async () => {
    const client = clientWith((path) => {
      if (path === "/api/anizone/anime/zone") return { data: { id: "zone", name: "Zone" }, providerEpisodes: [{ episodeId: "zone-episode-1", episodeNumber: 1 }] };
      if (path === "/api/anizone/sources/zone-episode-1") return playback;
      throw new Error(`Path inesperado: ${path}`);
    });
    const adapter = new AnizoneAdapter(client);
    const episodes = await adapter.getEpisodes({ providerKey: "anizone", providerAnimeId: "zone", providerSeasonId: "default", limit: 10 });
    expect(episodes.items[0]).toMatchObject({ providerKey: "anizone", providerAnimeId: "zone" });
    expect(episodes.items[0]?.sources).toHaveLength(1);
    expect(episodes.items[0]?.sources[0]?.providerKey).toBe("anizone");
    const result = await adapter.getPlayback({ providerKey: "anizone", providerAnimeId: "zone", providerSeasonId: "default", providerEpisodeId: "zone-episode-1", providerSourceId: "sub:default" });
    expect(result.selectedSourceId).toBe(result.sources?.[0]?.sourceId);
  });
});
