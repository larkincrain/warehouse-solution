import { describe, it, expect } from 'vitest';
import { InsufficientStockError, InvalidOrderError, NotFoundError, isKnownError } from '../../src/errors.js';

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
  it('isKnownError discriminates', () => {
    expect(isKnownError(new InvalidOrderError('x'))).toBe(true);
    expect(isKnownError(new Error('plain'))).toBe(false);
    expect(isKnownError('string')).toBe(false);
  });
});
