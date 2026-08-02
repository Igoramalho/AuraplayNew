export const PROVIDER_ERROR_CODES = [
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_ANIME_NOT_FOUND",
  "PROVIDER_EPISODE_NOT_FOUND",
  "PROVIDER_PLAYBACK_UNAVAILABLE",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_INVALID_RESPONSE",
] as const;

export type ProviderErrorCode = (typeof PROVIDER_ERROR_CODES)[number];

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly status: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProviderError";
  }
}

export function providerNotConfigured(): ProviderError {
  return new ProviderError("PROVIDER_NOT_CONFIGURED", "Provedor de episódios não configurado.", 503);
}
