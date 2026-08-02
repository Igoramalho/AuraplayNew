import type { EpisodeProvider } from "@/lib/provider/interface";
import { AnikotoAdapter } from "./anikoto-adapter";
import { AnizoneAdapter } from "./anizone-adapter";
import { KenjitsuClient } from "./client";
import { KenjitsuProvider } from "./provider";

export type KenjitsuAdapterKey = "anikoto" | "anizone";

export function createKenjitsuProvider(key: KenjitsuAdapterKey, baseUrl: string): EpisodeProvider {
  const client = new KenjitsuClient({ baseUrl });
  const adapter = key === "anikoto" ? new AnikotoAdapter(client) : new AnizoneAdapter(client);
  return new KenjitsuProvider(adapter);
}

export function parseKenjitsuKey(value: string): KenjitsuAdapterKey | null {
  const normalized = value.replace(/^kenjitsu[:-]/, "");
  return normalized === "anikoto" || normalized === "anizone" ? normalized : null;
}
