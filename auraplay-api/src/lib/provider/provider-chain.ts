import { ProviderError } from "./errors";
import type { EpisodeProvider } from "./interface";
import type { ProviderAnimeQuery, ProviderPageRequest } from "./types";

export function canFallback(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return false;
  if (error.code === "PROVIDER_RATE_LIMITED") return true;
  return error.code === "PROVIDER_UNAVAILABLE" && ![400, 401, 403].includes(error.status);
}

export class ProviderChain {
  readonly providers: readonly EpisodeProvider[];

  constructor(providers: readonly EpisodeProvider[]) {
    this.providers = providers;
  }

  get primary(): EpisodeProvider | undefined { return this.providers[0]; }

  get(providerKey: string): EpisodeProvider | undefined {
    return this.providers.find((provider) => provider.key === providerKey);
  }

  async getCatalog(request?: ProviderPageRequest) {
    let lastError: unknown;
    for (const provider of this.providers) {
      try {
        const result = await provider.getCatalog(request);
        if (result.items.length > 0) return { provider, result };
      } catch (error) {
        if (!canFallback(error)) throw error;
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    return { provider: this.primary, result: { items: [], nextCursor: null, hasMore: false } };
  }

  async findAnime(query: ProviderAnimeQuery) {
    let lastError: unknown;
    let lastUnsafe: { provider: EpisodeProvider; matches: Awaited<ReturnType<EpisodeProvider["findAnime"]>> } | undefined;
    for (const provider of this.providers) {
      try {
        const matches = await provider.findAnime(query);
        if (matches.length > 1) return { provider, matches, ambiguous: true };
        if (matches.length === 1) {
          const match = matches[0];
          if (match && (match.confidence >= 0.85 || ["ANILIST_ID", "MAL_ID", "PROVIDER_ID"].includes(match.matchMethod))) {
            return { provider, matches, ambiguous: false };
          }
          lastUnsafe = { provider, matches };
        }
      } catch (error) {
        if (!canFallback(error)) throw error;
        lastError = error;
      }
    }
    if (lastError) throw lastError;
    if (lastUnsafe) return { ...lastUnsafe, ambiguous: false };
    return { provider: this.primary, matches: [], ambiguous: false };
  }
}
