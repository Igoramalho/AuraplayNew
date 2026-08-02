import type { AnimeRepository } from "@/lib/supabase/repositories/anime.repository";
import type { AnimeRow } from "@/lib/supabase/database.types";
import type { SearchInput } from "@/schemas/search.schema";

import { mapAnimeCard } from "./api-mapper";

type SearchRepositoryPort = Pick<AnimeRepository, "search">;

export class SearchService {
  constructor(private readonly repository: SearchRepositoryPort) {}

  async search(input: SearchInput): Promise<ReturnType<typeof mapAnimeCard>[]> {
    const rows: AnimeRow[] = await this.repository.search(input.q, input.page, input.limit);
    return rows.map(mapAnimeCard);
  }
}
