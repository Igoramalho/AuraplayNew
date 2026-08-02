import { timingSafeEqual } from "node:crypto";

import { getEnv } from "../../config/env";

function equalsSafely(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isInternalRequestAuthorized(request: Request, secret = getEnv().SYNC_SECRET): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice("Bearer ".length);
  return token.length > 0 && equalsSafely(token, secret);
}
