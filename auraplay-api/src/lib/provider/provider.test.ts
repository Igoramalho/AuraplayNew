import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderFactory } from "./factory";
import type { EpisodeProvider } from "./interface";
import { PlaceholderProvider } from "./placeholder-provider";
import type { ProviderAudioType, ProviderPlaybackResult } from "./types";
import { KenjitsuProvider } from "../kenjitsu/provider";

const originalProvider = process.env.EPISODE_PROVIDER;
const originalProviders = process.env.EPISODE_PROVIDERS;
const originalBaseUrl = process.env.EPISODE_PROVIDER_BASE_URL;

afterEach(() => {
  vi.unstubAllEnvs();
  if (originalProvider === undefined) delete process.env.EPISODE_PROVIDER;
  else process.env.EPISODE_PROVIDER = originalProvider;
  if (originalProviders === undefined) delete process.env.EPISODE_PROVIDERS;
  else process.env.EPISODE_PROVIDERS = originalProviders;
  if (originalBaseUrl === undefined) delete process.env.EPISODE_PROVIDER_BASE_URL;
  else process.env.EPISODE_PROVIDER_BASE_URL = originalBaseUrl;
});

function expectProviderContract(provider: EpisodeProvider): EpisodeProvider {
  return provider;
}

describe("PlaceholderProvider", () => {
  it("implementa o contrato EpisodeProvider", () => {
    expect(expectProviderContract(new PlaceholderProvider()).key).toBe("not_configured");
  });

  it("retorna health controlado sem lançar exceção", async () => {
    await expect(new PlaceholderProvider().healthCheck()).resolves.toMatchObject({
      providerKey: null,
      status: "not_configured",
      errorCode: "PROVIDER_NOT_CONFIGURED",
    });
  });

  it("retorna PROVIDER_NOT_CONFIGURED em todas as operações de dados", async () => {
    const provider: EpisodeProvider = new PlaceholderProvider();
    const reference = { providerKey: "none", providerAnimeId: "anime" };
    const season = { ...reference, providerSeasonId: "season" };
    const episode = { ...season, providerEpisodeId: "episode", providerSourceId: "source" };
    const operations = [
      provider.getCatalog(),
      provider.findAnime({ externalIds: {}, titles: ["Anime"] }),
      provider.getAnimeDetails(reference),
      provider.getSeasons(reference),
      provider.getEpisodes(season),
      provider.getPlayback(episode),
    ];

    for (const operation of operations) {
      await expect(operation).rejects.toMatchObject({
        code: "PROVIDER_NOT_CONFIGURED",
        status: 503,
      });
    }
  });
});

describe("ProviderFactory", () => {
  it("usa placeholder quando EPISODE_PROVIDER está vazio", () => {
    vi.stubEnv("EPISODE_PROVIDER", "  ");
    expect(new ProviderFactory().create()).toBeInstanceOf(PlaceholderProvider);
  });

  it("usa placeholder para provider desconhecido", () => {
    expect(new ProviderFactory().create("unknown-provider")).toBeInstanceOf(PlaceholderProvider);
  });

  it("seleciona implementação registrada normalizando caixa e espaços", () => {
    const fake = new PlaceholderProvider();
    const factory = new ProviderFactory(new Map([["authorized", () => fake]]));
    expect(factory.create("  AUTHORIZED ")).toBe(fake);
  });

  it("não usa EPISODE_PROVIDER_BASE_URL sem implementação real", () => {
    vi.stubEnv("EPISODE_PROVIDER", "unknown");
    vi.stubEnv("EPISODE_PROVIDER_BASE_URL", "not-a-valid-url-and-must-not-be-read");
    expect(new ProviderFactory().create()).toBeInstanceOf(PlaceholderProvider);
  });

  it("seleciona adapter Kenjitsu documentado somente quando há base URL", () => {
    vi.stubEnv("EPISODE_PROVIDER_BASE_URL", "https://kenjitsu.test");
    expect(new ProviderFactory().create("kenjitsu:anikoto")).toBeInstanceOf(KenjitsuProvider);
    expect(new ProviderFactory().create("anizone")).toBeInstanceOf(KenjitsuProvider);
    expect(new ProviderFactory().create("animepahe")).toBeInstanceOf(PlaceholderProvider);
  });

  it("cria lista ordenada Anikoto → Anizone", () => {
    vi.stubEnv("EPISODE_PROVIDER_BASE_URL", "https://kenjitsu.test");
    const chain = new ProviderFactory().createOrdered("anikoto,anizone");
    expect(chain.providers.map((provider) => provider.key)).toEqual(["anikoto", "anizone"]);
  });

  it("mantém compatibilidade com EPISODE_PROVIDER antigo", () => {
    vi.stubEnv("EPISODE_PROVIDERS", "");
    vi.stubEnv("EPISODE_PROVIDER", "anizone");
    vi.stubEnv("EPISODE_PROVIDER_BASE_URL", "https://kenjitsu.test");
    expect(new ProviderFactory().createOrdered().providers.map((provider) => provider.key)).toEqual(["anizone"]);
  });

  it("EPISODE_PROVIDERS prevalece sobre EPISODE_PROVIDER", () => {
    vi.stubEnv("EPISODE_PROVIDERS", "anikoto,anizone");
    vi.stubEnv("EPISODE_PROVIDER", "anizone");
    vi.stubEnv("EPISODE_PROVIDER_BASE_URL", "https://kenjitsu.test");
    expect(new ProviderFactory().createOrdered().providers.map((provider) => provider.key)).toEqual(["anikoto", "anizone"]);
  });
});

describe("contratos de playback", () => {
  it("mantém RAW distinto e representa dados resolvidos sem alterar a fonte persistida", () => {
    const audioType: ProviderAudioType = "RAW";
    const playback: ProviderPlaybackResult = {
      url: "https://temporary.test/master.m3u8",
      expiresAt: null,
      mimeType: "application/vnd.apple.mpegurl",
      selectedSourceId: "resolved-1080p",
      sources: [{
        sourceId: "resolved-1080p",
        url: "https://temporary.test/master.m3u8",
        mimeType: "application/vnd.apple.mpegurl",
        type: "hls",
        headers: { Referer: "https://temporary.test/" },
        isM3u8: true,
        quality: "1080p",
        audioType,
        language: "ja",
        subtitleTracks: [{
          url: "https://temporary.test/pt-BR.vtt",
          language: "pt-BR",
          label: "Português",
          kind: "captions",
          default: true,
        }],
        intro: { start: 0, end: 90 },
        outro: null,
      }],
      selectedAudioType: audioType,
      audioLanguage: "ja",
      qualities: ["1080p"],
    };

    expect(playback.selectedAudioType).toBe("RAW");
    expect(playback.sources?.some((source) => source.sourceId === playback.selectedSourceId)).toBe(true);
    expect(playback.sources?.[0]?.subtitleTracks[0]?.language).toBe("pt-BR");
    expect(playback.qualities).toEqual(["1080p"]);
  });
});
