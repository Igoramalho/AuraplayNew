import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AnimeRepository } from "@/lib/supabase/repositories/anime.repository";
import { CatalogRepository } from "@/lib/supabase/repositories/catalog.repository";
import { EpisodeRepository } from "@/lib/supabase/repositories/episode.repository";
import { SyncRepository } from "@/lib/supabase/repositories/sync.repository";
import { ProviderPersistenceRepository } from "@/lib/supabase/repositories/provider-persistence.repository";

export function createRepositories() {
  const db = getSupabaseServerClient();
  return {
    anime: new AnimeRepository(db),
    catalog: new CatalogRepository(db),
    episode: new EpisodeRepository(db),
    providerPersistence: new ProviderPersistenceRepository(db),
    sync: new SyncRepository(db),
  };
}
