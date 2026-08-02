import { createEpisodesHandler } from "@/lib/http/public-handlers";
import { createPublicServices } from "@/services/public-services";

export const runtime = "nodejs";
export const GET = createEpisodesHandler(createPublicServices);
