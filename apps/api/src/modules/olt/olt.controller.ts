import { createOltSchema, listFiberQuerySchema, updateOltSchema } from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor, requireIdParam } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { OltService } from './olt.service.js';

export class OltController {
  constructor(private readonly olts: OltService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.olts.list());
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(createOltSchema, req.body);
    sendData(res, 201, await this.olts.create(requireActor(req), input, getRequestContext(req)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(updateOltSchema, req.body);
    const id = requireIdParam(req, 'olt id');
    sendData(
      res,
      200,
      await this.olts.update(requireActor(req), id, input, getRequestContext(req)),
    );
  };

  test = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.olts.test(requireIdParam(req, 'olt id')));
  };

  poll = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.olts.pollOne(requireIdParam(req, 'olt id')));
  };

  listFiber = async (req: Request, res: Response): Promise<void> => {
    const { items, pagination, summary } = await this.olts.listFiber(
      parseRequest(listFiberQuerySchema, req.query),
    );
    sendData(res, 200, items, { pagination, summary });
  };

  fiberOfCustomer = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.olts.ofCustomer(requireIdParam(req, 'customer id')));
  };
}
