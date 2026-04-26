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

export type KnownError = InsufficientStockError | InvalidOrderError | NotFoundError;

export function isKnownError(e: unknown): e is KnownError {
  return (
    e instanceof InsufficientStockError ||
    e instanceof InvalidOrderError ||
    e instanceof NotFoundError
  );
}
