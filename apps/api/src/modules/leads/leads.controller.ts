import {
  approveLeadSchema,
  createLeadSchema,
  listLeadsQuerySchema,
  rejectLeadSchema,
} from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor, requireIdParam } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { LeadService } from './leads.service.js';

export class LeadsController {
  constructor(private readonly service: LeadService) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(createLeadSchema, req.body);
    sendData(res, 201, await this.service.create(requireActor(req), input, getRequestContext(req)));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = parseRequest(listLeadsQuerySchema, req.query);
    const { items, pagination } = await this.service.list(requireActor(req), query);
    sendData(res, 200, items, { pagination });
  };

  approve = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(approveLeadSchema, req.body);
    const id = requireIdParam(req, 'lead id');
    sendData(
      res,
      200,
      await this.service.approve(requireActor(req), id, input, getRequestContext(req)),
    );
  };

  reject = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(rejectLeadSchema, req.body);
    const id = requireIdParam(req, 'lead id');
    sendData(
      res,
      200,
      await this.service.reject(requireActor(req), id, input, getRequestContext(req)),
    );
  };
}
