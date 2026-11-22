import type { Request, Response } from 'express';

export type ReadinessProbe = () => Promise<void>;

export class HealthController {
  constructor(private readonly probeDatabase: ReadinessProbe) {}

  /** Liveness: cheap, never touches the database. Used by keep-alive pings. */
  live = (_req: Request, res: Response): void => {
    res.status(200).json({ status: 'ok' });
  };

  /** Readiness: verifies the database answers. Exposes no internal detail. */
  ready = async (_req: Request, res: Response): Promise<void> => {
    try {
      await this.probeDatabase();
      res.status(200).json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  };
}
