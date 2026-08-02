import type { CatalogRepository } from "@/lib/supabase/repositories/catalog.repository";
import type { EpisodeProvider } from "@/lib/provider/interface";

type DatabaseHealthPort = Pick<CatalogRepository, "listSections">;

export class HealthService {
  constructor(private readonly catalog: DatabaseHealthPort, private readonly provider: EpisodeProvider) {}

  async getHealth() {
    let database: "ok" | "error" = "ok";
    try { await this.catalog.listSections(); } catch { database = "error"; }

    let provider: "configured" | "not_configured" | "error" = "error";
    try {
      const health = await this.provider.healthCheck();
      provider = health.status === "not_configured" ? "not_configured" : health.status === "error" ? "error" : "configured";
    } catch { provider = "error"; }

    return {
      status: database === "ok" ? "ok" : "degraded",
      service: "auraplay-api",
      timestamp: new Date().toISOString(),
      dependencies: { database, anilist: "degraded" as const, provider },
    };
  }
}
