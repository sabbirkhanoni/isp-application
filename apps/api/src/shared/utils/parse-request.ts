import type { z } from 'zod';
import { ValidationError } from '../errors/app-error.js';

/** Validates untrusted input with a shared Zod schema and throws a ValidationError on failure. */
export function parseRequest<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(
      'Validation failed.',
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}
