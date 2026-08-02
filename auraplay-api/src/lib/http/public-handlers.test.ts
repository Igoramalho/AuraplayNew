import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { ProviderError } from "../provider/errors";
import { FixedWindowRateLimiter } from "./rate-limit";
import {
  createAnimeHandler,
  createEpisodesHandler,
  createHealthHandler,
  createHomeHandler,
  createPlaybackHandler,
  createRemoteSearchHandler,
  createSearchHandler,
} from "./public-handlers";

function services() {
  return {
    health: { getHealth: vi.fn(async () => ({ status: "ok" })) },
    home: { getHome: vi.fn(async () => ({ featured: [], popularSeason: [], recentReleases: [], stale: false })) },
    search: { search: vi.fn(async () => [{ id: "anime" }]) },
    remoteSearch: { search: vi.fn(async () => ({ items: [{ anilistId: 20 }], page: 2, limit: 10, total: 21, hasNextPage: true })) },
    anime: { getAnime: vi.fn(async () => ({ id: "anime" })) },
    episodes: { getEpisodes: vi.fn(async () => ({ animeId: "anime", playbackStatus: "METADATA_ONLY", seasons: [] })) },
    playback: { getPlayback: vi.fn(async () => ({ url: "https://temporary.test/video", expiresAt: null, mimeType: null })) },
  };
}

describe("handlers das rotas públicas", () => {
  it("preserva exatamente os code points Unicode na serialização JSON", async () => {
    const fixture = {
      pt: "Agrupamento técnico local",
      en: "Frieren: Beyond Journey’s End",
      ja: "葬送のフリーレン",
      ru: "Наруто",
      ar: "ناروتو",
      he: "נארוטו",
      ko: "장송의 프리렌",
      th: "ฟรีเรน",
    };
    const deps = services();
    deps.home.getHome.mockResolvedValueOnce(fixture as never);
    const response = await createHomeHandler(() => deps)();
    const raw = await response.text();
    const decoded = JSON.parse(raw).data;

    expect(response.headers.get("content-type")).toMatch(/^application\/json/);
    expect(decoded).toEqual(fixture);
    for (const key of Object.keys(fixture) as Array<keyof typeof fixture>) {
      expect([...decoded[key]].map((character) => character.codePointAt(0)))
        .toEqual([...fixture[key]].map((character) => character.codePointAt(0)));
    }
  });

  it("health e home retornam envelope e requestId", async () => {
    const deps = services();
    for (const handler of [createHealthHandler(() => deps), createHomeHandler(() => deps)]) {
      const response = await handler();
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.meta.requestId).toBe(response.headers.get("x-request-id"));
    }
  });

  it("search valida, pagina e chama somente SearchService", async () => {
    const deps = services();
    const response = await createSearchHandler(() => deps)(new NextRequest("http://localhost/api/search?q=frieren&page=2&limit=10"));
    expect(response.status).toBe(200);
    expect(deps.search.search).toHaveBeenCalledWith({ q: "frieren", page: 2, limit: 10 });
    expect(deps.home.getHome).not.toHaveBeenCalled();
  });

  it("search inválida retorna 400 padronizado", async () => {
    const response = await createSearchHandler(() => services())(new NextRequest("http://localhost/api/search?q=x"));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
  });

  it("pesquisa remota é explícita, paginada e não chama a busca local", async () => {
    const deps = services();
    const response = await createRemoteSearchHandler(() => deps)(new NextRequest("http://localhost/api/search/remote?q=naruto&page=2&limit=10"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(deps.remoteSearch.search).toHaveBeenCalledWith({ q: "naruto", page: 2, limit: 10 });
    expect(deps.search.search).not.toHaveBeenCalled();
    expect(body).toMatchObject({ success: true, meta: { page: 2, limit: 10, total: 21, hasNextPage: true } });
  });

  it("anime aceita AniList ID e episódios aceitam UUID", async () => {
    const deps = services();
    const request = new NextRequest("http://localhost");
    await createAnimeHandler(() => deps)(request, { params: Promise.resolve({ id: "154587" }) });
    await createEpisodesHandler(() => deps)(request, { params: Promise.resolve({ animeId: "123e4567-e89b-42d3-a456-426614174000" }) });
    expect(deps.anime.getAnime).toHaveBeenCalledWith({ kind: "anilist", value: 154587 });
    expect(deps.episodes.getEpisodes).toHaveBeenCalledWith({ kind: "internal", value: "123e4567-e89b-42d3-a456-426614174000" });
  });

  it("playback traduz PlaceholderProvider para PROVIDER_NOT_CONFIGURED", async () => {
    const deps = services();
    deps.playback.getPlayback.mockRejectedValueOnce(new ProviderError("PROVIDER_NOT_CONFIGURED", "Provedor de episódios não configurado.", 503));
    const response = await createPlaybackHandler(() => deps)(new NextRequest("http://localhost"), {
      params: Promise.resolve({ episodeId: "123e4567-e89b-42d3-a456-426614174000" }),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ success: false, error: { code: "PROVIDER_NOT_CONFIGURED" } });
  });

  it("playback aplica rate limit com Retry-After", async () => {
    const deps = services();
    const limiter = new FixedWindowRateLimiter(1, 60_000, () => 1_000);
    const handler = createPlaybackHandler(() => deps, limiter);
    const request = new NextRequest("http://localhost", { headers: { "x-forwarded-for": "127.0.0.1" } });
    const context = { params: Promise.resolve({ episodeId: "123e4567-e89b-42d3-a456-426614174000" }) };
    expect((await handler(request, context)).status).toBe(200);
    const blocked = await handler(request, context);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBe("60");
  });
});
