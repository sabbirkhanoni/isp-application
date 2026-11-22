import {
  assignCollectorSchema,
  collectorOverviewQuerySchema,
  setTargetSchema,
} from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { CollectorsService } from './collectors.service.js';

export class CollectorsController {
  constructor(private readonly service: CollectorsService) {}

  overview = async (req: Request, res: Response): Promise<void> => {
    const { period } = parseRequest(collectorOverviewQuerySchema, req.query);
    sendData(res, 200, await this.service.overview(period));
  };

  mine = async (req: Request, res: Response): Promise<void> => {
    const { period } = parseRequest(collectorOverviewQuerySchema, req.query);
    sendData(res, 200, await this.service.mine(requireActor(req).userId, period));
  };

  setTarget = async (req: Request, res: Response): Promise<void> => {
    await this.service.setTarget(
      requireActor(req),
      parseRequest(setTargetSchema, req.body),
      getRequestContext(req),
    );
    sendData(res, 200, { ok: true });
  };

  assign = async (req: Request, res: Response): Promise<void> => {
    sendData(
      res,
      200,
      await this.service.assign(
        requireActor(req),
        parseRequest(assignCollectorSchema, req.body),
        getRequestContext(req),
      ),
    );
  };
}
