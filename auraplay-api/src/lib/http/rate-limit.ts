export interface RateLimitResult { allowed: boolean; retryAfterSeconds: number; }

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {}

  consume(key: string): RateLimitResult {
    const current = this.now();
    const window = this.windows.get(key);
    if (!window || window.resetAt <= current) {
      this.windows.set(key, { count: 1, resetAt: current + this.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (window.count >= this.limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - current) / 1_000)) };
    }
    window.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
