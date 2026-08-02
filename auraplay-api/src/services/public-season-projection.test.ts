import { describe, expect, it } from "vitest";

import type { AnimeRow, EpisodeRow, EpisodeSourceRow, SeasonRow } from "@/lib/supabase/database.types";
import { projectCanonicalEpisodes, projectCanonicalSeasons } from "./public-season-projection";

const anime = { id: "anime-real", anilist_id: 20, playback_status: "READY" } as AnimeRow;

function season(id: string, providerKey: string, number = 1, title: string | null = "Agrupamento técnico local", providerSeasonId = "default"): SeasonRow {
  return {
    id, anime_id: anime.id, provider_key: providerKey, provider_anime_id: `${providerKey}-anime`,
    provider_season_id: providerSeasonId, season_number: number, title,
    display_order: number - 1, created_at: "now", updated_at: "now",
  };
}

function episode(id: string, seasonId: string, number: number): EpisodeRow {
  return {
    id, anime_id: anime.id, season_id: seasonId, provider_episode_id: `${id}-provider`, episode_number: number,
    absolute_number: number, title: `Episódio ${number}`, description: null, duration_seconds: null,
    thumbnail_url: null, aired_at: null, available: true, created_at: "now", updated_at: "now",
  };
}

function source(id: string, episodeId: string, providerKey: string): EpisodeSourceRow {
  return {
    id, episode_id: episodeId, provider_key: providerKey, provider_source_id: `${id}-provider`, language: "pt-BR",
    audio_type: "SUB", quality: null, available: true, last_checked_at: null, created_at: "now", updated_at: "now",
  };
}

describe("projeção pública canônica", () => {
  it("une temporadas técnicas equivalentes e escolhe o provider configurado", () => {
    const result = projectCanonicalSeasons([season("season-zone", "anizone"), season("season-koto", "anikoto")], ["anikoto", "anizone"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ number: 1, title: "Temporada 1", preferred: { id: "season-koto", provider_key: "anikoto" } });
  });

  it("mantém temporada regular e OVA/Special número 1 separadas", () => {
    const result = projectCanonicalSeasons([
      season("regular", "anikoto", 1, "Temporada 1", "season-1"),
      season("ova", "anikoto", 1, "OVA", "ova-1"),
      season("special", "anizone", 1, "Special", "special-1"),
    ], ["anikoto", "anizone"]);
    expect(result.map((item) => item.preferred.id)).toEqual(["regular", "ova", "special"]);
  });

  it("mantém Season 0 separada da Season 1", () => {
    const result = projectCanonicalSeasons([
      season("season-0", "anikoto", 0), season("season-1", "anikoto", 1),
    ], ["anikoto"]);
    expect(result.map((item) => item.number)).toEqual([0, 1]);
  });

  it("preserva grupos ambíguos em vez de fundi-los", () => {
    const result = projectCanonicalSeasons([
      season("unknown-a", "anikoto", 1, null, "unknown-a"),
      season("unknown-b", "anizone", 1, null, "unknown-b"),
    ], ["anikoto", "anizone"]);
    expect(result).toHaveLength(2);
  });

  it("deduplica Naruto somente no grupo técnico equivalente e preserva UUIDs reais", () => {
    const seasons = [season("season-koto", "anikoto"), season("season-zone", "anizone")];
    const episodes = [
      episode("episode-koto-1", "season-koto", 1), episode("episode-zone-1", "season-zone", 1),
      episode("episode-zone-2", "season-zone", 2), episode("episode-koto-3", "season-koto", 3),
    ];
    const sources = new Map([
      ["episode-koto-1", [source("source-koto-1", "episode-koto-1", "anikoto")]],
      ["episode-zone-1", [source("source-zone-1", "episode-zone-1", "anizone")]],
      ["episode-zone-2", [source("source-zone-2", "episode-zone-2", "anizone")]],
      ["episode-koto-3", [source("source-koto-3", "episode-koto-3", "anikoto")]],
    ]);
    const group = projectCanonicalSeasons(seasons, ["anikoto", "anizone"])[0];
    const candidates = episodes.map((item) => ({
      episode: item,
      season: seasons.find((value) => value.id === item.season_id)!,
      sources: sources.get(item.id) ?? [],
    }));
    const result = projectCanonicalEpisodes(group, candidates, ["anikoto", "anizone"]);
    expect(result.map(({ episode: item }) => [item.episode_number, item.id])).toEqual([
      [1, "episode-koto-1"], [2, "episode-zone-2"], [3, "episode-koto-3"],
    ]);
    expect(new Set(result.map(({ episode: item }) => item.id)).size).toBe(3);
  });

  it("não deduplica episódios número 1 de temporadas não equivalentes", () => {
    const seasons = [season("regular", "anikoto", 1, "Temporada 1", "season-1"), season("ova", "anizone", 1, "OVA", "ova-1")];
    const groups = projectCanonicalSeasons(seasons, ["anikoto", "anizone"]);
    const candidates = seasons.map((item) => {
      const value = episode(`episode-${item.id}`, item.id, 1);
      return { episode: value, season: item, sources: [source(`source-${item.id}`, value.id, item.provider_key)] };
    });
    expect(groups.flatMap((group) => projectCanonicalEpisodes(group, candidates, ["anikoto", "anizone"]))).toHaveLength(2);
  });

  it("preserva episódios ambíguos do mesmo número quando títulos entram em conflito", () => {
    const seasons = [season("season-koto", "anikoto"), season("season-zone", "anizone")];
    const group = projectCanonicalSeasons(seasons, ["anikoto", "anizone"])[0];
    const left = { ...episode("episode-koto", seasons[0].id, 1), title: "Episode One" };
    const right = { ...episode("episode-zone", seasons[1].id, 1), title: "Special One" };
    const result = projectCanonicalEpisodes(group, [
      { episode: left, season: seasons[0], sources: [source("left", left.id, "anikoto")] },
      { episode: right, season: seasons[1], sources: [source("right", right.id, "anizone")] },
    ], ["anikoto", "anizone"]);
    expect(result.map(({ episode: item }) => item.id)).toEqual(["episode-koto", "episode-zone"]);
  });
});
