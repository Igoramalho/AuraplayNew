import { describe, expect, it } from "vitest";

import { ANIME_SEARCH_QUERY } from "./queries";
import { animeSearchResponseSchema } from "./schemas";

describe("contrato de pesquisa remota AniList", () => {
  it("exclui conteúdo adulto na própria query e aceita paginação validada", () => {
    expect(ANIME_SEARCH_QUERY).toContain("isAdult: false");
    expect(ANIME_SEARCH_QUERY).toContain("$page: Int!");
    expect(ANIME_SEARCH_QUERY).toContain("$perPage: Int!");
    const parsed = animeSearchResponseSchema.safeParse({
      data: {
        page: {
          pageInfo: { currentPage: 2, lastPage: 3, hasNextPage: true, perPage: 10, total: 25 },
          media: [],
        },
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita payload remoto incompleto", () => {
    expect(animeSearchResponseSchema.safeParse({ data: { page: { media: [] } } }).success).toBe(false);
  });
});
