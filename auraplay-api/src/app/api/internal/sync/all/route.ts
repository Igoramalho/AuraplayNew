import { createAllSyncHandler } from "@/lib/http/internal-handlers";
import { createInternalServices } from "@/services/internal-services";

export const runtime = "nodejs";
export const POST = createAllSyncHandler(createInternalServices);
