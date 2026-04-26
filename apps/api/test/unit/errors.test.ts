import { describe, it, expect } from 'vitest';
import {
  InsufficientStockError,
  InvalidOrderError,
  NotFoundError,
  IdempotencyReplayError,
  isKnownError,
  isUniqueViolation,
} from '../../src/errors.js';

describe('errors', () => {
  it('InsufficientStockError carries snapshot + 409', () => {
    const e = new InsufficientStockError([{ warehouseId: 'paris', stock: 0 }]);
    expect(e.code).toBe('INSUFFICIENT_STOCK');
    expect(e.httpStatus).toBe(409);
    expect(e.availableStock[0]?.warehouseId).toBe('paris');
  });
  it('InvalidOrderError → 422', () => {
    const e = new InvalidOrderError('shipping too high');
    expect(e.code).toBe('INVALID_ORDER');
    expect(e.httpStatus).toBe(422);
  });
  it('NotFoundError → 404', () => {
    const e = new NotFoundError('order missing');
    expect(e.httpStatus).toBe(404);
  });
  it('IdempotencyReplayError carries the key (internal sentinel, not in KnownError)', () => {
    const e = new IdempotencyReplayError('key-123');
    expect(e.code).toBe('IDEMPOTENCY_REPLAY');
    expect(e.idempotencyKey).toBe('key-123');
    expect(e.name).toBe('IdempotencyReplayError');
    expect(isKnownError(e)).toBe(false);
  });
  it('isKnownError discriminates', () => {
    expect(isKnownError(new InvalidOrderError('x'))).toBe(true);
    expect(isKnownError(new Error('plain'))).toBe(false);
    expect(isKnownError('string')).toBe(false);
  });
  it('isUniqueViolation matches SQLSTATE 23505 and optional constraint name', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(isUniqueViolation({ code: '23505', constraint: 'orders_idempotency_key_unique' }, 'orders_idempotency_key_unique')).toBe(true);
    expect(isUniqueViolation({ code: '23505', constraint: 'other_unique' }, 'orders_idempotency_key_unique')).toBe(false);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('not-an-object')).toBe(false);
  });
});
