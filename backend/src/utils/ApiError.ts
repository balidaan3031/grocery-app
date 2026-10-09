/**
 * The single error type the application throws on purpose.
 *
 * Anything else reaching the error handler is treated as a bug and reported as
 * a 500 with its details withheld from the client.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  /** Distinguishes deliberate domain failures from unexpected crashes. */
  readonly isOperational = true;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static validation(message: string, details?: unknown): ApiError {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'You do not have permission to do that'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static notFound(resource = 'Resource'): ApiError {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static conflict(message: string, details?: unknown): ApiError {
    return new ApiError(409, 'CONFLICT', message, details);
  }

  static insufficientStock(message: string, details?: unknown): ApiError {
    return new ApiError(409, 'INSUFFICIENT_STOCK', message, details);
  }

  /**
   * The barcode belongs to a deactivated product. Distinct from not-found so a
   * client offers "restore this product" instead of "create it", which would
   * only fail on the barcode the old product still owns.
   */
  static productInactive(product: { id: string; name: string }, barcode?: string): ApiError {
    return new ApiError(409, 'PRODUCT_INACTIVE', `${product.name} is deactivated and cannot be sold`, {
      productId: product.id,
      productName: product.name,
      ...(barcode ? { barcode } : {}),
    });
  }

  static tooManyRequests(message = 'Too many requests, please slow down'): ApiError {
    return new ApiError(429, 'RATE_LIMITED', message);
  }

  static internal(message = 'Something went wrong', details?: unknown): ApiError {
    return new ApiError(500, 'INTERNAL_ERROR', message, details);
  }
}
