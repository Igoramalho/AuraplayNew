import pLimit from "p-limit";
import type { z } from "zod";

import { delay, isRetryableStatus, retryDelayMs } from "../http/retry";
import { ProviderError } from "../provider/errors";

export interface KenjitsuClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  concurrency?: number;
}

export class KenjitsuClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly limit: ReturnType<typeof pLimit>;

  constructor(private readonly options: KenjitsuClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.retries = options.retries ?? 2;
    this.limit = pLimit(options.concurrency ?? 2);
  }

  get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return this.limit(() => this.request(path, schema));
  }

  private async request<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    const url = new URL(path, this.options.baseUrl);
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          method: "GET",
          signal: AbortSignal.timeout(this.timeoutMs),
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          if (isRetryableStatus(response.status) && attempt < this.retries) {
            await delay(retryDelayMs(attempt, response.headers.get("retry-after")));
            continue;
          }
          throw new ProviderError(
            response.status === 429 ? "PROVIDER_RATE_LIMITED" : "PROVIDER_UNAVAILABLE",
            "O provider de episódios não respondeu com sucesso.",
            response.status,
          );
        }
        const parsed = schema.safeParse(await response.json());
        if (!parsed.success) {
          throw new ProviderError("PROVIDER_INVALID_RESPONSE", "Resposta inválida do provider de episódios.", 502, { cause: parsed.error });
        }
        return parsed.data;
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if (attempt < this.retries && (error instanceof TypeError || (error instanceof DOMException && error.name === "TimeoutError"))) {
          await delay(retryDelayMs(attempt, null));
          continue;
        }
        throw new ProviderError("PROVIDER_UNAVAILABLE", "Não foi possível acessar o provider de episódios.", 503, { cause: error });
      }
    }
    throw new ProviderError("PROVIDER_UNAVAILABLE", "Não foi possível acessar o provider de episódios.", 503);
  }
}
