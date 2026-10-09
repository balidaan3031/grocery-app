/** The error envelope the API returns; see backend `ApiFailure`. */
export interface ApiErrorShape {
  code: string;
  message: string;
  details?: unknown;
  status?: number;
}

/**
 * A normalised error the UI can rely on.
 *
 * Every failure path — HTTP error, network drop, unexpected throw — is funnelled
 * into this shape by the API client, so screens never have to guess whether
 * they are holding an Axios error, a string, or something else.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor({ code, message, details, status = 0 }: ApiErrorShape) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  /** The scan found no product — the scanner offers to create one instead. */
  get isProductNotFound(): boolean {
    return this.code === 'PRODUCT_NOT_FOUND';
  }

  /** The barcode belongs to a deactivated product — restore it rather than create a new one. */
  get isProductInactive(): boolean {
    return this.code === 'PRODUCT_INACTIVE';
  }

  get isInsufficientStock(): boolean {
    return this.code === 'INSUFFICIENT_STOCK';
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.code === 'UNAUTHORIZED';
  }

  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR';
  }
}

export interface StockErrorDetails {
  productId: string;
  productName: string;
  available: number;
  requested: number;
}

/** Reads the structured payload the API attaches to a stock failure. */
export const stockDetailsOf = (error: unknown): StockErrorDetails | null => {
  if (!(error instanceof AppError) || !error.isInsufficientStock) return null;
  const details = error.details as Partial<StockErrorDetails> | undefined;
  if (!details || typeof details.available !== 'number') return null;
  return {
    productId: String(details.productId ?? ''),
    productName: String(details.productName ?? 'This product'),
    available: details.available,
    requested: Number(details.requested ?? 0),
  };
};

/** The deactivated product a PRODUCT_INACTIVE error names. */
export const inactiveProductOf = (error: unknown): { productId: string; productName: string } | null => {
  if (!(error instanceof AppError) || !error.isProductInactive) return null;
  const details = error.details as { productId?: unknown; productName?: unknown } | undefined;
  if (!details || typeof details.productId !== 'string') return null;
  return { productId: details.productId, productName: String(details.productName ?? 'This product') };
};

/** Safe message extraction for anything that reaches a catch block. */
export const messageOf = (error: unknown, fallback = 'Something went wrong'): string => {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
};

/** Field-level messages from a 422, keyed by field name. */
export const fieldErrorsOf = (error: unknown): Record<string, string> => {
  if (!(error instanceof AppError) || error.code !== 'VALIDATION_ERROR') return {};
  const issues = error.details;
  if (!Array.isArray(issues)) return {};

  const result: Record<string, string> = {};
  for (const issue of issues) {
    if (issue && typeof issue === 'object' && 'field' in issue && 'message' in issue) {
      const field = String((issue as { field: unknown }).field);
      // Zod reports the leaf path; the form binds by the top-level field name.
      const key = field.split('.')[0] ?? field;
      if (!result[key]) result[key] = String((issue as { message: unknown }).message);
    }
  }
  return result;
};
