import { isTransientDbError } from '../errors.js';

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
}

/**
 * Runs `fn` and retries on Postgres transient failures (deadlock /
 * serialization). Backoff is exponential with full jitter so concurrent
 * retriers don't synchronize and re-collide.
 *
 * Non-transient errors (validation, insufficient stock, programming bugs)
 * propagate on the first attempt — we must not retry those.
 */
export async function withTxRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const baseDelay = opts.baseDelayMs ?? 10;
  const maxDelay = opts.maxDelayMs ?? 200;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e) {
      if (!isTransientDbError(e) || attempt >= opts.maxRetries) throw e;
      const cap = Math.min(maxDelay, baseDelay * 2 ** attempt);
      const delay = Math.floor(Math.random() * cap);
      opts.onRetry?.(attempt + 1, e, delay);
      await sleep(delay);
      attempt += 1;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
