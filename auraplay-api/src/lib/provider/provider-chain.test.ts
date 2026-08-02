import { describe, expect, it, vi } from "vitest";

import { ProviderError } from "./errors";
import type { EpisodeProvider } from "./interface";
import { ProviderChain } from "./provider-chain";

function provider(key: "anikoto" | "anizone", behavior: { unavailable?: boolean; empty?: boolean; ambiguous?: boolean; unsafe?: boolean } = {}): EpisodeProvider {
  const providerAnimeId = key === "anikoto" ? "naruto-eybxz" : "naruto-spjuxray";
  return {
    key,
    healthCheck: vi.fn(async () => ({ providerKey: key, status: "ok" as const, checkedAt: "now", latencyMs: 1 })),
    getCatalog: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    findAnime: vi.fn(async () => {
      if (behavior.unavailable) throw new ProviderError("PROVIDER_UNAVAILABLE", "offline", 503);
      if (behavior.empty) return [];
      const match = { providerKey: key, providerAnimeId, title: "Naruto", externalIds: { anilistId: 20, malId: 20 }, confidence: behavior.unsafe ? 0.5 : 1, matchMethod: behavior.unsafe ? "METADATA" as const : "ANILIST_ID" as const };
      return behavior.ambiguous ? [match, { ...match, providerAnimeId: `${providerAnimeId}-other` }] : [match];
    }),
    getAnimeDetails: vi.fn(async () => { throw new Error("not used"); }),
    getSeasons: vi.fn(async () => []),
    getEpisodes: vi.fn(async () => ({ items: [], nextCursor: null, hasMore: false })),
    getPlayback: vi.fn(async () => { throw new Error("not used"); }),
  };
}

const naruto = { externalIds: { anilistId: 20, malId: 20 }, titles: ["Naruto"], year: 2002, format: "TV", expectedEpisodeCount: 220 };

describe("ProviderChain offline", () => {
  it("usa Anikoto quando há resultado seguro e preserva seu ID", async () => {
    const anikoto = provider("anikoto");
    const anizone = provider("anizone");
    const result = await new ProviderChain([anikoto, anizone]).findAnime(naruto);
    expect(result.provider?.key).toBe("anikoto");
    expect(result.matches[0]?.providerAnimeId).toBe("naruto-eybxz");
    expect(anizone.findAnime).not.toHaveBeenCalled();
  });

  it.each([
    ["indisponível", { unavailable: true }],
    ["vazio", { empty: true }],
  ])("usa Anizone quando Anikoto está %s", async (_label, behavior) => {
    const anikoto = provider("anikoto", behavior);
    const anizone = provider("anizone");
    const result = await new ProviderChain([anikoto, anizone]).findAnime(naruto);
    expect(result.provider?.key).toBe("anizone");
    expect(result.matches[0]?.providerAnimeId).toBe("naruto-spjuxray");
  });

  it("não tenta Anizone quando Anikoto retorna ambiguidade", async () => {
    const anikoto = provider("anikoto", { ambiguous: true });
    const anizone = provider("anizone");
    const result = await new ProviderChain([anikoto, anizone]).findAnime(naruto);
    expect(result).toMatchObject({ provider: { key: "anikoto" }, ambiguous: true });
    expect(anizone.findAnime).not.toHaveBeenCalled();
  });

  it("usa Anizone quando Anikoto não possui matching seguro", async () => {
    const anikoto = provider("anikoto", { unsafe: true });
    const anizone = provider("anizone");
    const result = await new ProviderChain([anikoto, anizone]).findAnime(naruto);
    expect(result.provider?.key).toBe("anizone");
    expect(result.matches[0]?.providerAnimeId).toBe("naruto-spjuxray");
  });

  it("não faz fallback para erro interno de validação", async () => {
    const anikoto = provider("anikoto");
    vi.mocked(anikoto.findAnime).mockRejectedValueOnce(new ProviderError("PROVIDER_INVALID_RESPONSE", "invalid", 502));
    const anizone = provider("anizone");
    await expect(new ProviderChain([anikoto, anizone]).findAnime(naruto)).rejects.toMatchObject({ code: "PROVIDER_INVALID_RESPONSE" });
    expect(anizone.findAnime).not.toHaveBeenCalled();
  });
});
