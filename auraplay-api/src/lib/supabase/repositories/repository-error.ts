export class RepositoryError extends Error {
  constructor(
    public readonly operation: string,
    public readonly databaseCode?: string,
    options?: ErrorOptions,
  ) {
    super(`Falha na operação de banco: ${operation}.`, options);
    this.name = "RepositoryError";
  }
}

export function throwRepositoryError(operation: string, error: { code?: string; message: string }): never {
  throw new RepositoryError(operation, error.code, { cause: error });
}
