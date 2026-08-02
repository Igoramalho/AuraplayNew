import { pathToFileURL } from "node:url";

interface InitialSyncPort {
  syncAll(options: { limit: number }): Promise<unknown>;
}

export async function runInitialSync(sync: InitialSyncPort, write: (message: string) => void = console.log): Promise<unknown> {
  const result = await sync.syncAll({ limit: 20 });
  write(JSON.stringify(result, null, 2));
  return result;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  import("../src/services/internal-services").then(({ createInternalServices }) => runInitialSync(createInternalServices().sync)).catch((error: unknown) => {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "INITIAL_SYNC_FAILED";
    console.error(JSON.stringify({ success: false, error: { code } }));
    process.exitCode = 1;
  });
}
