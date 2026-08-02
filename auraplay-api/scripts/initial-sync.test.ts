import { describe, expect, it, vi } from "vitest";

import { runInitialSync } from "./initial-sync";

describe("sync:initial", () => {
  it("chama SyncService diretamente sem HTTP e usa lote inicial 20", async () => {
    const result = { status: "PARTIAL", catalog: { status: "SUCCEEDED" }, provider: { status: "PARTIAL" }, episodes: { status: "PARTIAL" } };
    const sync = { syncAll: vi.fn(async () => result) };
    const write = vi.fn();
    await expect(runInitialSync(sync, write)).resolves.toBe(result);
    expect(sync.syncAll).toHaveBeenCalledWith({ limit: 20 });
    expect(write).toHaveBeenCalledOnce();
  });
});
