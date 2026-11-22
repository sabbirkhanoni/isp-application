import { topUsageQuerySchema } from '@isp/contracts';
import type { Request, Response } from 'express';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { sendData } from '../../shared/utils/response.js';
import type { UsageService } from './usage.service.js';

export class UsageController {
  constructor(private readonly service: UsageService) {}

  forCustomer = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.forCustomer(String(req.params['customerId'])));
  };

  top = async (req: Request, res: Response): Promise<void> => {
    const { period, limit } = parseRequest(topUsageQuerySchema, req.query);
    sendData(res, 200, await this.service.top(period, limit));
  };
}
