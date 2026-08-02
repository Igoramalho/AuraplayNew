export class ExternalApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ExternalApiError";
  }
}
