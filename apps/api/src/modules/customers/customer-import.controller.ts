import { importCustomersSchema } from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { CustomerImportService } from './customer-import.service.js';

export class CustomerImportController {
  constructor(private readonly service: CustomerImportService) {}

  run = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(importCustomersSchema, req.body);
    sendData(res, 200, await this.service.run(requireActor(req), input, getRequestContext(req)));
  };
}
