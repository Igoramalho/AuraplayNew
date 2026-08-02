import { describe, expect, it, vi } from "vitest";

import type { AniListMedia } from "../anilist/types";
import { JikanClient } from "./client";
import { MetadataFallbackService } from "../../services/metadata-fallback.service";

const validJikanBody = {
  data: {
    mal_id: 52991,
    title_english: "Frieren: Beyond Journey's End",
    titles: [
      { type: "Default", title: "Sousou no Frieren" },
      { type: "English", title: "Frieren: Beyond Journey's End" },
      { type: "Synonym", title: "Frieren at the Funeral" },
    ],
    synopsis: "A mage retraces a journey.",
    images: {
      jpg: { image_url: "https://cdn.test/image.jpg", small_image_url: null, large_image_url: "https://cdn.test/large.jpg" },
      webp: { image_url: "https://cdn.test/image.webp", small_image_url: null, large_image_url: "https://cdn.test/large.webp" },
    },
    duration: "24 min per ep",
  },
};

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function media(overrides: Partial<AniListMedia> = {}): AniListMedia {
  return {
    id: 154587, idMal: 52991,
    title: { romaji: "Sousou no Frieren", english: "Frieren: Beyond Journey's End", native: "葬送のフリーレン" },
    synonyms: ["Frieren at the Funeral"], description: "AniList synopsis",
    coverImage: { extraLarge: "https://anilist.test/cover.jpg", large: null, color: null }, bannerImage: null,
    averageScore: 90, popularity: 1, trending: 1, genres: ["Adventure"], format: "TV", status: "FINISHED",
    season: "FALL", seasonYear: 2023, startDate: { year: 2023, month: 9, day: 29 }, endDate: { year: 2024, month: 3, day: 22 },
    episodes: 28, duration: 24, countryOfOrigin: "JP", isAdult: false, relations: { edges: [] }, nextAiringEpisode: null,
    ...overrides,
  };
}

function clientWith(fetcher: typeof fetch, options: { maxAttempts?: number; sleep?: (ms: number) => Promise<void> } = {}): JikanClient {
  return new JikanClient({ fetcher, baseUrl: "https://jikan.test/v4", minIntervalMs: 0, ...options });
}

describe("JikanClient", () => {
  it("valida, mapeia e mantém cache por MAL ID", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      void input;
      return jsonResponse(validJikanBody);
    });
    const client = clientWith(fetcher as unknown as typeof fetch);
    expect((await client.getAnimeByMalId(52991)).durationMinutes).toBe(24);
    await client.getAnimeByMalId(52991);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("https://jikan.test/v4/anime/52991");
  });

  it("respeita Retry-After em 429 e tenta novamente", async () => {
    const sleep = vi.fn(async () => undefined);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ message: "rate limited" }, 429, { "retry-after": "2" }))
      .mockResolvedValueOnce(jsonResponse(validJikanBody)) as unknown as typeof fetch;
    await clientWith(fetcher, { sleep }).getAnimeByMalId(52991);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it("não repete erro definitivo 404", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ message: "not found" }, 404)) as unknown as typeof fetch;
    await expect(clientWith(fetcher).getAnimeByMalId(999999)).rejects.toMatchObject({ code: "JIKAN_HTTP_ERROR", status: 404 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejeita resposta malformada validada pelo Zod", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ data: { mal_id: "invalid" } })) as unknown as typeof fetch;
    await expect(clientWith(fetcher).getAnimeByMalId(52991)).rejects.toMatchObject({ code: "JIKAN_INVALID_RESPONSE" });
  });

  it("serializa chamadas concorrentes", async () => {
    let active = 0;
    let maximumActive = 0;
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      const malId = Number(String(input).split("/").at(-1));
      return jsonResponse({ ...validJikanBody, data: { ...validJikanBody.data, mal_id: malId } });
    }) as unknown as typeof fetch;
    const client = clientWith(fetcher);
    await Promise.all([client.getAnimeByMalId(1), client.getAnimeByMalId(2)]);
    expect(maximumActive).toBe(1);
  });
});

describe("MetadataFallbackService", () => {
  it("não chama Jikan quando AniList já possui os campos permitidos", async () => {
    const fetcher = vi.fn(async () => jsonResponse(validJikanBody)) as unknown as typeof fetch;
    const service = new MetadataFallbackService(clientWith(fetcher));
    const result = await service.enrich(media());
    expect(result.usedFallback).toBe(false);
    expect(result.sources.description).toBe("ANILIST");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("completa somente campos ausentes sem sobrescrever valores AniList", async () => {
    const fetcher = vi.fn(async () => jsonResponse(validJikanBody)) as unknown as typeof fetch;
    const service = new MetadataFallbackService(clientWith(fetcher));
    const result = await service.enrich(media({
      title: { romaji: "Sousou no Frieren", english: null, native: "葬送のフリーレン" },
      synonyms: [], description: null, coverImage: { extraLarge: null, large: null, color: "#fff" }, duration: null,
    }));
    expect(result.usedFallback).toBe(true);
    expect(result.enrichedFields).toEqual(["description", "titleEnglish", "coverImage", "synonyms", "duration"]);
    expect(result.value.title.romaji).toBe("Sousou no Frieren");
    expect(result.value.title.english).toBe("Frieren: Beyond Journey's End");
    expect(result.sources.description).toBe("JIKAN");
  });

  it("mantém AniList intacto quando Jikan falha", async () => {
    const fetcher = vi.fn(async () => jsonResponse({}, 503)) as unknown as typeof fetch;
    const original = media({ description: null });
    const result = await new MetadataFallbackService(clientWith(fetcher, { maxAttempts: 1 })).enrich(original);
    expect(result.value).toBe(original);
    expect(result.usedFallback).toBe(false);
    expect(result.fallbackErrorCode).toBe("JIKAN_HTTP_ERROR");
  });

  it("não consulta sem MAL ID mesmo quando faltam campos", async () => {
    const fetcher = vi.fn(async () => jsonResponse(validJikanBody)) as unknown as typeof fetch;
    const result = await new MetadataFallbackService(clientWith(fetcher)).enrich(media({ idMal: null, description: null }));
    expect(result.usedFallback).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
