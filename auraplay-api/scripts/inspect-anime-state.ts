import { z } from "zod";

import { createRepositories } from "../src/lib/supabase/repositories";
import { getSupabaseServerClient } from "../src/lib/supabase/server";

async function main() {
  const rawId = process.argv.find((item) => item.startsWith("--anilist-id="))?.split("=")[1];
  const anilistId = z.coerce.number().int().positive().parse(rawId);
  const repositories = createRepositories();
  const db = getSupabaseServerClient();
  const anime = await repositories.anime.findByAnilistId(anilistId);

  if (!anime) {
    console.log(JSON.stringify({ anilistId, exists: false }, null, 2));
    return;
  }

  const [providers, seasons, episodes, catalogEntries] = await Promise.all([
  db.from("provider_animes").select("provider_key,provider_anime_id,match_status,updated_at").eq("anime_id", anime.id),
  db.from("seasons").select("id,provider_key,provider_anime_id,updated_at").eq("anime_id", anime.id),
  db.from("episodes").select("id,season_id,thumbnail_url,updated_at").eq("anime_id", anime.id),
  db.from("catalog_entries").select("section_id,updated_at").eq("anime_id", anime.id),
  ]);
  for (const result of [providers, seasons, episodes, catalogEntries]) if (result.error) throw result.error;
const providerRows = providers.data ?? [];
const seasonRows = seasons.data ?? [];
const episodeRows = episodes.data ?? [];
const catalogEntryRows = catalogEntries.data ?? [];
const episodeIds = episodeRows.map((item) => item.id);
const sourceResult = episodeIds.length === 0
  ? { data: [], error: null }
  : await db.from("episode_sources").select("provider_key,provider_source_id,updated_at").in("episode_id", episodeIds);
if (sourceResult.error) throw sourceResult.error;
const transientPattern = /https?:|referer|authorization|cookie|token|signature/i;
const latest = (values: string[]) => values.sort().at(-1) ?? null;

  console.log(JSON.stringify({
  anilistId,
  exists: true,
  animeId: anime.id,
  malId: anime.mal_id,
  providers: providerRows,
  counts: {
    providerAnimes: providerRows.length,
    seasons: seasonRows.length,
    episodes: episodeRows.length,
    episodeSources: sourceResult.data.length,
    catalogEntries: catalogEntryRows.length,
  },
  transientAudit: {
    providerThumbnails: episodeRows.filter((item) => Boolean(item.thumbnail_url)).length,
    suspiciousSourceIds: sourceResult.data.filter((item) => transientPattern.test(item.provider_source_id)).length,
  },
  timestamps: {
    anime: anime.updated_at,
    providers: latest(providerRows.map((item) => item.updated_at)),
    seasons: latest(seasonRows.map((item) => item.updated_at)),
    episodes: latest(episodeRows.map((item) => item.updated_at)),
    episodeSources: latest(sourceResult.data.map((item) => item.updated_at)),
    catalogEntries: latest(catalogEntryRows.map((item) => item.updated_at)),
  },
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Falha desconhecida.");
  process.exitCode = 1;
});
