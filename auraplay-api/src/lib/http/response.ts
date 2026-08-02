import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ProviderError } from "../provider/errors";

export class ApiHttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ApiHttpError";
  }
}

function headers(requestId: string): HeadersInit {
  return { "x-request-id": requestId, "cache-control": "no-store" };
}

export function apiSuccess<T>(data: T, requestId: string, status = 200, meta: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ success: true, data, meta: { ...meta, requestId } }, { status, headers: headers(requestId) });
}

export function apiError(error: unknown, requestId: string): NextResponse {
  let status = 500;
  let code = "INTERNAL_ERROR";
  let message = "Erro interno do servidor.";

  if (error instanceof ZodError) {
    status = 400;
    code = "VALIDATION_ERROR";
    message = error.issues[0]?.message ?? "Parâmetros inválidos.";
  } else if (error instanceof ApiHttpError) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else if (error instanceof ProviderError) {
    status = error.status;
    code = error.code;
    message = error.message;
  }

  return NextResponse.json({ success: false, error: { code, message, requestId } }, { status, headers: headers(requestId) });
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
