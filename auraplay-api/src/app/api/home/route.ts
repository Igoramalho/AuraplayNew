import { createHomeHandler } from "@/lib/http/public-handlers";
import { createPublicServices } from "@/services/public-services";

export const runtime = "nodejs";
export const GET = createHomeHandler(createPublicServices);
