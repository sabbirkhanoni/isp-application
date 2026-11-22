import { exportParamSchema } from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { SystemService } from './system.service.js';

export class SystemController {
  constructor(private readonly service: SystemService) {}

  check = async (_req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.check());
  };

  dataQuality = async (_req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.dataQuality());
  };

  exportCsv = async (req: Request, res: Response): Promise<void> => {
    const { name } = parseRequest(exportParamSchema, { name: req.params['name'] });
    const { filename, body } = await this.service.exportCsv(
      name,
      requireActor(req),
      getRequestContext(req),
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  };
}
