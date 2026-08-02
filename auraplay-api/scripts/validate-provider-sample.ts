import { z } from "zod";

import { normalizeTitle } from "../src/lib/anilist/mapper";
import { providerFactory } from "../src/lib/provider/factory";
import type { ProviderCatalogAnime } from "../src/lib/provider/types";
import { createRepositories } from "../src/lib/supabase/repositories";
import { getSupabaseServerClient } from "../src/lib/supabase/server";
import { EpisodePersistenceSink, ProviderCatalogPersistenceSink } from "../src/services/provider-persistence.sink";

const targetSchema = z.string().transform((value, context) => {
  const [providerKey, providerAnimeId, rawLimit] = value.split(":");
  const limit = Number(rawLimit);
  if (!providerKey || !providerAnimeId || !Number.isSafeInteger(limit) || limit < 1 || limit > 3) {
    context.addIssue({ code: "custom", message: "Target deve usar provider:id:limit, com limite entre 1 e 3." });
    return z.NEVER;
  }
  return { providerKey, providerAnimeId, limit };
});

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}

function argumentsFor(name: string): string[] {
  return process.argv.filter((item) => item.startsWith(`--${name}=`)).map((item) => item.slice(name.length + 3));
}

async function counts(animeId: string) {
  const db = getSupabaseServerClient();
  const [providerAnimes, seasons, episodes] = await Promise.all([
    db.from("provider_animes").select("id", { count: "exact", head: true }).eq("anime_id", animeId),
    db.from("seasons").select("id", { count: "exact", head: true }).eq("anime_id", animeId),
    db.from("episodes").select("id", { count: "exact" }).eq("anime_id", animeId),
  ]);
  for (const result of [providerAnimes, seasons, episodes]) if (result.error) throw result.error;
  const episodeIds = episodes.data?.map((item) => item.id) ?? [];
  const sourceResult = episodeIds.length === 0
    ? { count: 0, error: null }
    : await db.from("episode_sources").select("id", { count: "exact", head: true }).in("episode_id", episodeIds);
  if (sourceResult.error) throw sourceResult.error;
  return {
    providerAnimes: providerAnimes.count ?? 0,
    seasons: seasons.count ?? 0,
    episodes: episodes.count ?? 0,
    episodeSources: sourceResult.count ?? 0,
  };
}

async function main() {
  const anilistId = z.coerce.number().int().positive().parse(argument("anilist-id"));
  const expectedInternalId = z.string().uuid().parse(argument("expected-internal-id"));
  const targets = z.array(targetSchema).min(1).max(2).parse(argumentsFor("target"));
  const write = process.argv.includes("--write");
  const playback = process.argv.includes("--playback");
  const repositories = createRepositories();
  const anime = await repositories.anime.findByAnilistId(anilistId);
  if (!anime || anime.id !== expectedInternalId) {
    throw new Error("O anime canônico não corresponde ao UUID interno esperado; nenhuma escrita foi executada.");
  }
  if (process.argv.includes("--audit-only")) {
    const db = getSupabaseServerClient();
    const { data: episodes, error: episodeError } = await db.from("episodes").select("id,thumbnail_url").eq("anime_id", anime.id);
    if (episodeError) throw episodeError;
    if (process.argv.includes("--scrub-transient")) {
      for (const episode of await repositories.episode.listEpisodes(anime.id)) {
        if (episode.thumbnail_url) await repositories.providerPersistence.upsertEpisode({ ...episode, thumbnail_url: null });
      }
      console.log(JSON.stringify({ mode: "scrub-transient", animeId: anime.id, thumbnailsCleared: episodes.filter((item) => Boolean(item.thumbnail_url)).length }, null, 2));
      return;
    }
    const episodeIds = episodes.map((item) => item.id);
    const { data: sources, error: sourceError } = await db.from("episode_sources").select("provider_key,provider_source_id").in("episode_id", episodeIds);
    if (sourceError) throw sourceError;
    const transientPattern = /https?:|referer|authorization|cookie|token|signature/i;
    console.log(JSON.stringify({
      mode: "audit-only",
      animeId: anime.id,
      episodes: episodes.length,
      thumbnailUrlsPersisted: episodes.filter((item) => Boolean(item.thumbnail_url)).length,
      sources: sources.length,
      transientPatternInProviderSourceId: sources.some((item) => transientPattern.test(item.provider_source_id)),
      sourcesByProvider: Object.fromEntries([...new Set(sources.map((item) => item.provider_key))]
        .map((key) => [key, sources.filter((item) => item.provider_key === key).length])),
    }, null, 2));
    return;
  }
  const titles = await repositories.anime.listTitles(anime.id);
  const chain = providerFactory.createOrdered();
  const configuredOrder = chain.providers.map((provider) => provider.key);
  const previews: Array<{ item: ProviderCatalogAnime; limit: number; totalEpisodes: number | null; health: unknown; searchFound: boolean }> = [];

  for (const target of targets) {
    const provider = chain.get(target.providerKey);
    if (!provider) throw new Error(`Provider ${target.providerKey} não está configurado.`);
    const query = {
      externalIds: { anilistId: anime.anilist_id, malId: anime.mal_id ?? undefined },
      titles: [anime.preferred_title, ...titles.map((item) => item.title)],
      format: anime.format,
      year: anime.season_year,
      expectedEpisodeCount: anime.expected_episode_count,
    };
    const [health, matches, details] = await Promise.all([
      provider.healthCheck(),
      provider.findAnime(query),
      provider.getAnimeDetails({ providerKey: target.providerKey, providerAnimeId: target.providerAnimeId }),
    ]);
    const searchFound = matches.some((match) => match.providerAnimeId === target.providerAnimeId);
    const canonicalIdMatch = details.externalIds.anilistId === anime.anilist_id || details.externalIds.malId === anime.mal_id;
    const canonicalTitles = new Set(query.titles.map(normalizeTitle));
    const metadataMatch = canonicalTitles.has(normalizeTitle(details.title))
      && details.year === anime.season_year
      && details.format?.toLocaleUpperCase() === anime.format?.toLocaleUpperCase()
      && details.episodeCount === anime.expected_episode_count;
    if (!searchFound || (!canonicalIdMatch && !metadataMatch)) {
      throw new Error(`Matching inequívoco não confirmado para ${target.providerKey}; nenhuma escrita foi executada.`);
    }
    previews.push({ item: details, limit: target.limit, totalEpisodes: details.episodeCount, health, searchFound });
  }

  const sanitizedPreview = previews.map(({ item, limit, totalEpisodes, health, searchFound }) => ({
    animeId: anime.id,
    anilistId: anime.anilist_id,
    malId: anime.mal_id,
    providerKey: item.providerKey,
    providerAnimeId: item.providerAnimeId,
    matchMethod: item.externalIds.anilistId === anime.anilist_id ? "ANILIST_ID" : item.externalIds.malId === anime.mal_id ? "MAL_ID" : "METADATA",
    confidence: item.externalIds.anilistId === anime.anilist_id ? 1 : item.externalIds.malId === anime.mal_id ? 0.98 : 0.9,
    evidence: { title: item.title, year: item.year, format: item.format, searchFound },
    totalEpisodes,
    requestedEpisodeLimit: limit,
    health,
  }));
  if (!write) {
    console.log(JSON.stringify({ mode: "preview", configuredOrder, canonicalAnimeConfirmed: true, preview: sanitizedPreview }, null, 2));
    return;
  }

  const before = await counts(anime.id);
  const catalogSink = new ProviderCatalogPersistenceSink(repositories.providerPersistence);
  const episodeSink = new EpisodePersistenceSink(repositories.providerPersistence);
  const persistence = [];
  for (const preview of previews) {
    const association = await catalogSink.persist([preview.item]);
    const provider = chain.get(preview.item.providerKey);
    if (!provider) throw new Error("Provider deixou de estar configurado.");
    const batch = await provider.getEpisodes({
      providerKey: preview.item.providerKey,
      providerAnimeId: preview.item.providerAnimeId,
      providerSeasonId: "default",
      limit: preview.limit,
    });
    const stableItems = batch.items.slice(0, preview.limit).map((item) => ({ ...item, thumbnailUrl: null }));
    const episodes = await episodeSink.persist(stableItems);
    persistence.push({ providerKey: preview.item.providerKey, association, episodes });
  }
  const after = await counts(anime.id);

  let playbackResult: unknown = null;
  if (playback) {
    const target = targets[0];
    if (!target) throw new Error("Target de playback ausente.");
    const provider = chain.get(target.providerKey);
    if (!provider) throw new Error("Provider de playback não configurado.");
    const seasons = await repositories.episode.listSeasons(anime.id);
    const season = seasons.find((item) => item.provider_key === target.providerKey && item.provider_anime_id === target.providerAnimeId);
    const episodes = await repositories.episode.listEpisodes(anime.id);
    const episode = episodes.find((item) => item.season_id === season?.id && item.episode_number === 1);
    if (!season || !episode) throw new Error("Episódio 1 persistido não encontrado.");
    const sources = await repositories.episode.listAvailableSources(episode.id);
    const source = sources.find((item) => item.provider_key === target.providerKey && item.audio_type === "SUB");
    if (!source) throw new Error("Fonte SUB estável persistida não encontrada.");
    const resolved = await provider.getPlayback({
      providerKey: source.provider_key,
      providerAnimeId: season.provider_anime_id,
      providerSeasonId: season.provider_season_id,
      providerEpisodeId: episode.provider_episode_id,
      providerSourceId: source.provider_source_id,
    });
    playbackResult = {
      providerKey: source.provider_key,
      persistedSourceId: source.provider_source_id,
      sourceCount: resolved.sources.length,
      selectedSourceId: resolved.selectedSourceId,
      selectedExists: resolved.sources.some((item) => item.sourceId === resolved.selectedSourceId),
      qualities: resolved.qualities ?? [],
      selectedIsM3u8: resolved.sources.find((item) => item.sourceId === resolved.selectedSourceId)?.isM3u8 ?? null,
      subtitleCount: resolved.subtitleTracks?.length ?? 0,
      subtitleLanguages: [...new Set((resolved.subtitleTracks ?? []).map((item) => item.language).filter(Boolean))],
      hasHeaders: Object.keys(resolved.headers ?? {}).length > 0,
      hasIntro: resolved.intro !== null && resolved.intro !== undefined,
      hasOutro: resolved.outro !== null && resolved.outro !== undefined,
    };
  }
  console.log(JSON.stringify({ mode: "write", configuredOrder, preview: sanitizedPreview, before, persistence, after, playback: playbackResult }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falha desconhecida.");
  process.exitCode = 1;
});
