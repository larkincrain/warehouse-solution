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
 * Reusing an idempotency-key with a different request body is a programming
 * error in the client — replaying must mean *the same operation*. We surface
 * 409 Conflict so the client can detect the mistake instead of silently
 * receiving the original (unrelated) order back.
 */
export class IdempotencyKeyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_KEY_REUSED' as const;
  readonly httpStatus = 409;
  constructor() {
    super('Idempotency-Key was previously used with a different request body');
    this.name = 'IdempotencyKeyConflictError';
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

export type KnownError =
  | InsufficientStockError
  | InvalidOrderError
  | NotFoundError
  | IdempotencyKeyConflictError;

export function isKnownError(e: unknown): e is KnownError {
  return (
    e instanceof InsufficientStockError ||
    e instanceof InvalidOrderError ||
    e instanceof NotFoundError ||
    e instanceof IdempotencyKeyConflictError
  );
}

/**
 * Detects Postgres transient errors that warrant a retry: deadlock_detected
 * (40P01) and serialization_failure (40001). Both classes mean "the tx aborted
 * because of concurrent activity, not because the request was bad".
 */
export function isTransientDbError(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const code = (e as { code?: string }).code;
  return code === '40001' || code === '40P01';
}
