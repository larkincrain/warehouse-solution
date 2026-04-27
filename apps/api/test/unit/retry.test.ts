import { describe, expect, it, vi } from 'vitest';
import { withTxRetry } from '../../src/db/retry.js';

class PgError extends Error {
  constructor(public code: string) { super(`pg ${code}`); }
}

describe('withTxRetry', () => {
  it('returns the value on first success', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withTxRetry(fn, { maxRetries: 3 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries 40001 (serialization_failure)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new PgError('40001'))
      .mockResolvedValueOnce('ok');
    const result = await withTxRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries 40P01 (deadlock_detected)', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new PgError('40P01'))
      .mockRejectedValueOnce(new PgError('40P01'))
      .mockResolvedValueOnce('ok');
    const result = await withTxRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 1 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry non-transient errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('logic error'));
    await expect(withTxRetry(fn, { maxRetries: 3 })).rejects.toThrow('logic error');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new PgError('40001'));
    await expect(withTxRetry(fn, { maxRetries: 2, baseDelayMs: 1, maxDelayMs: 1 }))
      .rejects.toMatchObject({ code: '40001' });
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });
});
