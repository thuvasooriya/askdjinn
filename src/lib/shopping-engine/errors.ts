/** Base error for shopping-domain operations. */
export class ShoppingError extends Error {
  readonly code: string;
  readonly recoverable: boolean;
  readonly details?: unknown;

  constructor(message: string, options: { code: string; recoverable?: boolean; details?: unknown }) {
    super(message);
    this.name = new.target.name;
    this.code = options.code;
    this.recoverable = options.recoverable ?? true;
    this.details = options.details;
  }
}

/** Raised when product or cart input cannot be used safely. */
export class ShoppingValidationError extends ShoppingError {
  constructor(message: string, details?: unknown) {
    super(message, { code: "shopping_validation_error", recoverable: true, details });
  }
}

/** Raised when checkout cannot proceed without user correction. */
export class CheckoutValidationError extends ShoppingError {
  constructor(message: string, details?: unknown) {
    super(message, { code: "checkout_validation_error", recoverable: true, details });
  }
}

/** Raised when a normalized external response is not usable. */
export class ShoppingNormalizeError extends ShoppingError {
  constructor(message: string, details?: unknown) {
    super(message, { code: "shopping_normalize_error", recoverable: true, details });
  }
}
