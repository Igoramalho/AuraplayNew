import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ProviderError } from "../provider/errors";
import { KenjitsuClient } from "./client";
import { animeDetailsSchema } from "./schemas";

describe("KenjitsuClient", () => {
  it("valida respostas externas com Zod", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const client = new KenjitsuClient({ baseUrl: "https://kenjitsu.test", fetchImpl, retries: 0 });

    await expect(client.get("/documented", z.object({ data: z.string() }))).resolves.toEqual({ data: "ok" });
    expect(fetchImpl).toHaveBeenCalledWith(new URL("https://kenjitsu.test/documented"), expect.objectContaining({ method: "GET" }));
  });

  it("rejeita payload inválido sem expor o conteúdo", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: 1 }), { status: 200 }));
    const client = new KenjitsuClient({ baseUrl: "https://kenjitsu.test", fetchImpl, retries: 0 });

    await expect(client.get("/documented", z.object({ data: z.string() }))).rejects.toMatchObject({
      code: "PROVIDER_INVALID_RESPONSE",
    });
  });

  it("repete 429 respeitando Retry-After e não repete 404", async () => {
    const retryingFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429, headers: { "retry-after": "0" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = new KenjitsuClient({ baseUrl: "https://kenjitsu.test", fetchImpl: retryingFetch, retries: 1 });
    await expect(client.get("/documented", z.object({ ok: z.boolean() }))).resolves.toEqual({ ok: true });
    expect(retryingFetch).toHaveBeenCalledTimes(2);

    const finalFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const finalClient = new KenjitsuClient({ baseUrl: "https://kenjitsu.test", fetchImpl: finalFetch, retries: 2 });
    await expect(finalClient.get("/documented", z.unknown())).rejects.toBeInstanceOf(ProviderError);
    expect(finalFetch).toHaveBeenCalledTimes(1);
  });

  it("normaliza IDs externos numéricos recebidos como string", () => {
    const parsed = animeDetailsSchema.parse({
      data: { id: "naruto", name: "Naruto", anilistId: "20", malId: "20" },
      providerEpisodes: [],
    });
    expect(parsed.data).toMatchObject({ anilistId: 20, malId: 20 });
  });
});
