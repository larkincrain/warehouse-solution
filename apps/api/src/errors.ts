export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK' as const;
  readonly httpStatus = 409;
  constructor(public readonly availableStock: { warehouseId: string; stock: number }[]) {
    super('Insufficient stock to fulfill order');
    this.name = 'InsufficientStockError';
  }
}

export class InvalidOrderError extends Error {
  readonly code = 'INVALID_ORDER' as const;
  readonly httpStatus = 422;
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderError';
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND' as const;
  readonly httpStatus = 404;
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Internal sentinel: thrown inside `submitOrder`'s transaction when a concurrent
 * submit with the same idempotency key wins the unique-constraint race. Caller
 * catches this OUTSIDE the transaction (since the tx is already aborted) and
 * re-reads the existing order. Not part of the public KnownError union.
 */
export class IdempotencyReplayError extends Error {
  readonly code = 'IDEMPOTENCY_REPLAY' as const;
  constructor(public readonly idempotencyKey: string) {
    super('idempotency-key replay');
    this.name = 'IdempotencyReplayError';
  }
}

/**
 * Postgres unique_violation detector. Matches SQLSTATE 23505 with an optional
 * constraint name check.
 */
export function isUniqueViolation(e: unknown, constraintName?: string): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const err = e as { code?: string; constraint?: string };
  if (err.code !== '23505') return false;
  if (constraintName && err.constraint !== constraintName) return false;
  return true;
}

export type KnownError = InsufficientStockError | InvalidOrderError | NotFoundError;

export function isKnownError(e: unknown): e is KnownError {
  return (
    e instanceof InsufficientStockError ||
    e instanceof InvalidOrderError ||
    e instanceof NotFoundError
  );
}
