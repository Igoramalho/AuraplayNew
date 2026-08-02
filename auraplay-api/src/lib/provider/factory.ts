import type { EpisodeProvider } from "./interface";
import { PlaceholderProvider } from "./placeholder-provider";
import { createKenjitsuProvider, parseKenjitsuKey } from "../kenjitsu/factory";
import { ProviderChain } from "./provider-chain";

export type EpisodeProviderFactory = () => EpisodeProvider;

function normalizeProviderKey(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase("en-US") ?? "";
}

export function parseProviderOrder(
  providerList: string | undefined = process.env.EPISODE_PROVIDERS,
  legacyProvider: string | undefined = process.env.EPISODE_PROVIDER,
): string[] {
  const configured = providerList?.trim() ? providerList.split(",") : [legacyProvider ?? ""];
  return [...new Set(configured.map(normalizeProviderKey).filter(Boolean))];
}

export class ProviderFactory {
  constructor(private readonly providers: ReadonlyMap<string, EpisodeProviderFactory> = new Map()) {}

  create(providerKey: string | undefined = process.env.EPISODE_PROVIDER): EpisodeProvider {
    const normalized = normalizeProviderKey(providerKey);
    const factory = this.providers.get(normalized);
    if (factory) return factory();

    const kenjitsuKey = parseKenjitsuKey(normalized);
    const baseUrl = process.env.EPISODE_PROVIDER_BASE_URL?.trim();
    return kenjitsuKey && baseUrl ? createKenjitsuProvider(kenjitsuKey, baseUrl) : new PlaceholderProvider();
  }

  createOrdered(providerList: string | undefined = process.env.EPISODE_PROVIDERS): ProviderChain {
    const configured = parseProviderOrder(providerList);
    const providers: EpisodeProvider[] = [];
    const seen = new Set<string>();
    for (const key of configured) {
      const provider = this.create(key);
      if (provider.key === "not_configured" || seen.has(provider.key)) continue;
      seen.add(provider.key);
      providers.push(provider);
    }
    return new ProviderChain(providers.length > 0 ? providers : [new PlaceholderProvider()]);
  }
}

export const providerFactory = new ProviderFactory();
