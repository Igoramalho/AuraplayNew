import { normalizeTitle } from "../lib/anilist/mapper";
import type { MatchStatus } from "@/constants/sync-status";
import type { AnimeRow, ProviderAnimeRow } from "@/lib/supabase/database.types";
import type { ProviderPersistenceRepository } from "@/lib/supabase/repositories/provider-persistence.repository";
import type { ProviderCatalogAnime, ProviderEpisode } from "@/lib/provider/types";

type PersistencePort = Pick<ProviderPersistenceRepository,
  "findProviderAnime" | "findAnimeByAnilistId" | "findAnimeByMalId" | "findAnimeCandidates" |
  "findProviderAnimeByAnimeId" |
  "upsertProviderAnime" | "findSeason" | "upsertSeason" | "findEpisode" | "upsertEpisode" |
  "findEpisodeSource" | "upsertEpisodeSource">;

interface MatchDecision {
  anime: AnimeRow | null;
  status: MatchStatus;
  confidence: number | null;
  method: string | null;
}

function metadataScore(item: ProviderCatalogAnime, anime: AnimeRow): number {
  let score = 0.45; // candidato já compartilha ao menos um título normalizado
  if (item.year !== null && item.year === anime.season_year) score += 0.25;
  if (item.format && anime.format && item.format.toLowerCase() === anime.format.toLowerCase()) score += 0.2;
  return Math.min(score, 1);
}

export class ProviderCatalogPersistenceSink {
  constructor(private readonly repository: PersistencePort, private readonly now = () => new Date().toISOString()) {}

  private async match(item: ProviderCatalogAnime, existing: ProviderAnimeRow | null): Promise<MatchDecision> {
    if (existing?.anime_id) {
      return {
        anime: { id: existing.anime_id } as AnimeRow,
        status: existing.match_status,
        confidence: existing.match_confidence,
        method: existing.match_method ?? "PROVIDER_ID",
      };
    }

    if (item.externalIds.anilistId !== undefined) {
      const anime = await this.repository.findAnimeByAnilistId(item.externalIds.anilistId);
      if (anime) return { anime, status: "AUTO_MATCHED", confidence: 1, method: "ANILIST_ID" };
    }
    if (item.externalIds.malId !== undefined) {
      const anime = await this.repository.findAnimeByMalId(item.externalIds.malId);
      if (anime) return { anime, status: "AUTO_MATCHED", confidence: 0.98, method: "MAL_ID" };
    }

    const titles = [...new Set([item.title, ...item.alternativeTitles].map(normalizeTitle).filter(Boolean))];
    const candidates = await this.repository.findAnimeCandidates(titles);
    if (candidates.length === 0) return { anime: null, status: "NOT_FOUND", confidence: null, method: null };
    const ranked = candidates.map((anime) => ({ anime, score: metadataScore(item, anime) }))
      .sort((left, right) => right.score - left.score);
    const best = ranked[0];
    const ambiguous = !best || ranked.some((candidate, index) => index > 0 && candidate.score === best.score);
    if (!best || ambiguous) return { anime: null, status: "AMBIGUOUS", confidence: best?.score ?? null, method: "METADATA" };
    if (best.score < 0.85) return { anime: null, status: "NEEDS_REVIEW", confidence: best.score, method: "METADATA" };
    return { anime: best.anime, status: "AUTO_MATCHED", confidence: best.score, method: "METADATA" };
  }

  async persist(items: ProviderCatalogAnime[]) {
    const validated = items.map((item) => {
      if (!item.providerKey.trim() || !item.providerAnimeId.trim() || !item.title.trim()) {
        throw Object.assign(new Error("Item de catálogo do provider inválido."), { code: "INVALID_PROVIDER_CATALOG_BATCH" });
      }
      return item;
    });

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let needsReview = 0;
    for (const item of validated) {
      const existing = await this.repository.findProviderAnime(item.providerKey, item.providerAnimeId);
      let decision = await this.match(item, existing);
      if (decision.anime && !existing) {
        const conflictingAssociation = await this.repository.findProviderAnimeByAnimeId(item.providerKey, decision.anime.id);
        if (conflictingAssociation && conflictingAssociation.provider_anime_id !== item.providerAnimeId) {
          decision = { anime: null, status: "NEEDS_REVIEW", confidence: decision.confidence, method: decision.method };
        }
      }
      await this.repository.upsertProviderAnime({
        anime_id: decision.anime?.id ?? null,
        provider_key: item.providerKey,
        provider_anime_id: item.providerAnimeId,
        provider_title: item.title,
        match_status: decision.status,
        match_confidence: decision.confidence,
        match_method: decision.method,
        last_sync_at: this.now(),
      });
      if (existing) updated += 1;
      else created += 1;
      if (!decision.anime) skipped += 1;
      if (decision.status === "NEEDS_REVIEW" || decision.status === "AMBIGUOUS") needsReview += 1;
    }
    return { created, updated, skipped, needsReview };
  }
}

export interface EpisodePersistenceResult {
  created: number;
  updated: number;
  skipped: number;
  rawSkipped: number;
  sourceCreated: number;
  sourceUpdated: number;
  skippedReasons: Record<string, number>;
}

function increment(reasons: Record<string, number>, reason: string): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

export class EpisodePersistenceSink {
  constructor(private readonly repository: PersistencePort, private readonly now = () => new Date().toISOString()) {}

  async persist(items: ProviderEpisode[]): Promise<EpisodePersistenceResult> {
    const reasons: Record<string, number> = {};
    if (items.length === 0) return { created: 0, updated: 0, skipped: 0, rawSkipped: 0, sourceCreated: 0, sourceUpdated: 0, skippedReasons: reasons };

    const identity = items[0];
    if (!identity) throw Object.assign(new Error("Lote de episódios vazio."), { code: "INVALID_EPISODE_BATCH" });
    if (items.some((item) => item.providerKey !== identity.providerKey || item.providerAnimeId !== identity.providerAnimeId || item.providerSeasonId !== identity.providerSeasonId)) {
      throw Object.assign(new Error("Lote mistura identidades de provider."), { code: "INVALID_EPISODE_BATCH" });
    }

    const seenIds = new Set<string>();
    const seenNumbers = new Set<number>();
    const valid: ProviderEpisode[] = [];
    let skipped = 0;
    for (const item of items) {
      if (!item.providerEpisodeId.trim() || !Number.isFinite(item.number) || item.number < 0) {
        skipped += 1; increment(reasons, "EPISODE_NUMBER_NOT_DOCUMENTED"); continue;
      }
      if (seenIds.has(item.providerEpisodeId) || seenNumbers.has(item.number)) {
        skipped += 1; increment(reasons, "DUPLICATE_EPISODE_IN_BATCH"); continue;
      }
      seenIds.add(item.providerEpisodeId); seenNumbers.add(item.number); valid.push(item);
    }

    if (valid.length === 0) {
      return { created: 0, updated: 0, skipped, rawSkipped: 0, sourceCreated: 0, sourceUpdated: 0, skippedReasons: reasons };
    }

    const association = await this.repository.findProviderAnime(identity.providerKey, identity.providerAnimeId);
    if (!association?.anime_id || !["AUTO_MATCHED", "MATCHED"].includes(association.match_status)) {
      return { created: 0, updated: 0, skipped: skipped + valid.length, rawSkipped: 0, sourceCreated: 0, sourceUpdated: 0, skippedReasons: { ...reasons, PROVIDER_MATCH_NOT_APPROVED: valid.length } };
    }

    let season = await this.repository.findSeason(identity.providerKey, identity.providerAnimeId, "default");
    if (!season) {
      season = await this.repository.upsertSeason({
        anime_id: association.anime_id,
        provider_key: identity.providerKey,
        provider_anime_id: identity.providerAnimeId,
        provider_season_id: "default",
        season_number: 1,
        title: "Agrupamento técnico local",
        display_order: 0,
      });
    }

    let created = 0;
    let updated = 0;
    let rawSkipped = 0;
    let sourceCreated = 0;
    let sourceUpdated = 0;
    for (const item of valid) {
      const persistibleSources = item.sources.filter((source) => {
        if (source.audioType === "RAW") {
          rawSkipped += 1; skipped += 1; increment(reasons, "RAW_NOT_SUPPORTED_BY_DATABASE"); return false;
        }
        return true;
      });
      const existingEpisode = await this.repository.findEpisode(season.id, item.providerEpisodeId);
      const episode = await this.repository.upsertEpisode({
        anime_id: association.anime_id,
        season_id: season.id,
        provider_episode_id: item.providerEpisodeId,
        episode_number: item.number,
        absolute_number: item.absoluteNumber,
        title: item.title,
        description: item.description,
        duration_seconds: item.durationSeconds,
        // Imagens do provider são transitórias; o visual canônico pertence ao AniList/Jikan.
        thumbnail_url: null,
        aired_at: item.airedAt,
        available: item.available && persistibleSources.length > 0,
      });
      if (existingEpisode) updated += 1;
      else created += 1;

      for (const source of persistibleSources) {
        if (!source.providerSourceId.trim()) { skipped += 1; increment(reasons, "INVALID_PROVIDER_SOURCE_ID"); continue; }
        const audioType = source.audioType as "SUB" | "DUB" | "MULTI";
        const existingSource = await this.repository.findEpisodeSource(episode.id, source.providerKey ?? item.providerKey, source.providerSourceId, audioType);
        await this.repository.upsertEpisodeSource({
          episode_id: episode.id,
          provider_key: source.providerKey ?? item.providerKey,
          provider_source_id: source.providerSourceId,
          language: source.language,
          audio_type: audioType,
          quality: source.quality,
          available: source.available,
          last_checked_at: this.now(),
        });
        if (existingSource) sourceUpdated += 1;
        else sourceCreated += 1;
      }
    }
    return { created, updated, skipped, rawSkipped, sourceCreated, sourceUpdated, skippedReasons: reasons };
  }
}
