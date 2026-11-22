import type { Response } from 'express';

export function sendData<T>(
  res: Response,
  status: number,
  data: T,
  meta: Record<string, unknown> = {},
): void {
  res.status(status).json({ data, meta: { requestId: res.req.requestId, ...meta } });
}
