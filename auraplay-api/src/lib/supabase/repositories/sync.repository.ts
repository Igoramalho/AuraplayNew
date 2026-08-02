import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json, SyncJobRow } from "@/lib/supabase/database.types";
import { throwRepositoryError } from "@/lib/supabase/repositories/repository-error";

export class SyncRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async acquireLock(lockKey: string, ownerId: string, ttlSeconds = 300): Promise<boolean> {
    const { data, error } = await this.db.rpc("acquire_sync_lock", {
      p_lock_key: lockKey, p_owner_id: ownerId, p_ttl_seconds: ttlSeconds,
    });
    if (error) throwRepositoryError("sync.acquireLock", error);
    return data;
  }

  async releaseLock(lockKey: string, ownerId: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("release_sync_lock", { p_lock_key: lockKey, p_owner_id: ownerId });
    if (error) throwRepositoryError("sync.releaseLock", error);
    return data;
  }

  async startJob(jobType: string, metadata: Json = {}): Promise<SyncJobRow> {
    const { data, error } = await this.db.from("sync_jobs").insert({
      job_type: jobType,
      metadata,
      started_at: new Date().toISOString(),
    }).select().single();
    if (error) throwRepositoryError("sync.startJob", error);
    return data;
  }

  async finishJob(id: string, update: Database["public"]["Tables"]["sync_jobs"]["Update"]): Promise<SyncJobRow> {
    const { data, error } = await this.db.from("sync_jobs").update({ ...update, finished_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throwRepositoryError("sync.finishJob", error);
    return data;
  }
}
