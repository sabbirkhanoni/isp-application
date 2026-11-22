import type { ErrorCode } from '@isp/contracts';

/** Base class for every error that is safe to show to API clients. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details: unknown[] = [],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed.', details: unknown[] = []) {
    super('VALIDATION_ERROR', 400, message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication is required.') {
    super('UNAUTHENTICATED', 401, message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor() {
    super('INVALID_CREDENTIALS', 401, 'Invalid username or password.');
  }
}

export class PasswordChangeRequiredError extends AppError {
  constructor() {
    super('PASSWORD_CHANGE_REQUIRED', 403, 'You must change your password before continuing.');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.') {
    super('FORBIDDEN', 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super('NOT_FOUND', 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', 409, message);
  }
}

export class RateLimitedError extends AppError {
  constructor() {
    super('RATE_LIMITED', 429, 'Too many requests. Please try again later.');
  }
}
