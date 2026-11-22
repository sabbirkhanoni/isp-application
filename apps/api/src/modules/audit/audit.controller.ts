import { listAuditQuerySchema } from '@isp/contracts';
import type { Request, Response } from 'express';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { sendData } from '../../shared/utils/response.js';
import type { AuditService } from './audit.service.js';

export class AuditController {
  constructor(private readonly service: AuditService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, pagination } = await this.service.list(
      parseRequest(listAuditQuerySchema, req.query),
    );
    sendData(res, 200, items, { pagination });
  };
}
