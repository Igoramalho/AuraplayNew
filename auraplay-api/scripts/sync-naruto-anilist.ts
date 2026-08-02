import { AniListClient } from "@/lib/anilist/client";
import { normalizeTitle } from "@/lib/anilist/mapper";
import { aniListMediaSchema } from "@/lib/anilist/schemas";
import { createRepositories } from "@/lib/supabase/repositories";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AnimeMetadataService } from "@/services/anime-metadata.service";

const expectedNarutoSchema = aniListMediaSchema.refine((media) => (
  media.id === 20
  && media.idMal === 20
  && media.title.romaji !== null
  && normalizeTitle(media.title.romaji) === "naruto"
  && media.format === "TV"
  && media.startDate.year === 2002
  && media.isAdult === false
), "Os metadados canônicos do AniList ID 20 não coincidem com o esperado.");

async function relatedCounts(animeId: string | null) {
  if (!animeId) return { providerAnimes: 0, seasons: 0, episodes: 0, sources: 0, catalogEntries: 0 };
  const db = getSupabaseServerClient();
  const [providerAnimes, seasons, episodes, catalogEntries] = await Promise.all([
    db.from("provider_animes").select("id", { count: "exact", head: true }).eq("anime_id", animeId),
    db.from("seasons").select("id", { count: "exact", head: true }).eq("anime_id", animeId),
    db.from("episodes").select("id", { count: "exact", head: true }).eq("anime_id", animeId),
    db.from("catalog_entries").select("anime_id", { count: "exact", head: true }).eq("anime_id", animeId),
  ]);
  for (const result of [providerAnimes, seasons, episodes, catalogEntries]) {
    if (result.error) throw result.error;
  }
  const { data: episodeRows, error: episodeError } = await db.from("episodes").select("id").eq("anime_id", animeId);
  if (episodeError) throw episodeError;
  let sources = 0;
  if (episodeRows.length > 0) {
    const sourceResult = await db.from("episode_sources").select("id", { count: "exact", head: true }).in("episode_id", episodeRows.map((item) => item.id));
    if (sourceResult.error) throw sourceResult.error;
    sources = sourceResult.count ?? 0;
  }
  return {
    providerAnimes: providerAnimes.count ?? 0,
    seasons: seasons.count ?? 0,
    episodes: episodes.count ?? 0,
    sources,
    catalogEntries: catalogEntries.count ?? 0,
  };
}

async function main() {
  const write = process.argv.includes("--write");
  const repositories = createRepositories();
  const media = expectedNarutoSchema.parse(await new AniListClient().getAnimeById(20));
  const [byAnilist, byMal, titleCandidates] = await Promise.all([
    repositories.anime.findByAnilistId(20),
    repositories.providerPersistence.findAnimeByMalId(20),
    repositories.anime.search("Naruto", 1, 20),
  ]);
  const conflicts = [byMal, ...titleCandidates].filter((item) => item && item.anilist_id !== 20);
  if (conflicts.length > 0) throw new Error("Conflito canônico detectado; nenhuma escrita foi executada.");

  const aliases = [...new Set([
    media.title.romaji,
    media.title.english,
    media.title.native,
    ...media.synonyms,
  ].filter((value): value is string => Boolean(value?.trim())))];
  const preview = {
    anilistId: media.id,
    malId: media.idMal,
    title: media.title.romaji,
    year: media.startDate.year,
    format: media.format,
    aliases,
    existingAnimeId: byAnilist?.id ?? null,
    operation: byAnilist ? "update" : "create",
  };
  if (!write) {
    console.log(JSON.stringify({ mode: "preview", preview }, null, 2));
    return;
  }

  const result = await new AnimeMetadataService(repositories.anime).persist(media);
  const stored = await repositories.anime.findByAnilistId(20);
  if (!stored || stored.mal_id !== 20) throw new Error("Falha na verificação do registro canônico persistido.");
  const [searchResults, titles, relations, counts] = await Promise.all([
    repositories.anime.search("Naruto", 1, 20),
    repositories.anime.listTitles(stored.id),
    repositories.anime.listRelations(stored.id),
    relatedCounts(stored.id),
  ]);
  console.log(JSON.stringify({
    mode: "write",
    preview,
    result,
    verification: {
      animeId: stored.id,
      anilistId: stored.anilist_id,
      malId: stored.mal_id,
      searchFound: searchResults.some((item) => item.id === stored.id),
      titleCount: titles.length,
      relationCount: relations.length,
      ...counts,
    },
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falha desconhecida.");
  process.exitCode = 1;
});
