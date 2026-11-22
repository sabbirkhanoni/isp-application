/** True for a unique-constraint violation, whether Prisma or the pg driver reported it. */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const e = error as { code?: unknown; cause?: { code?: unknown; originalCode?: unknown } };
  return e.code === 'P2002' || e.cause?.code === '23505' || e.cause?.originalCode === '23505';
}
