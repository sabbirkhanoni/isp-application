import {
  createCustomerSchema,
  listCustomersQuerySchema,
  suspendCustomerSchema,
  terminateCustomerSchema,
  updateCustomerSchema,
} from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor, requireIdParam } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { CustomerStatusService } from './customer-status.service.js';
import type { CustomerService } from './customers.service.js';

export class CustomersController {
  constructor(
    private readonly service: CustomerService,
    private readonly status: CustomerStatusService,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, pagination } = await this.service.list(
      parseRequest(listCustomersQuerySchema, req.query),
    );
    sendData(res, 200, items, { pagination });
  };

  get = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.getById(requireIdParam(req, 'customer id')));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(createCustomerSchema, req.body);
    sendData(res, 201, await this.service.create(requireActor(req), input, getRequestContext(req)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(updateCustomerSchema, req.body);
    const id = requireIdParam(req, 'customer id');
    sendData(
      res,
      200,
      await this.service.update(requireActor(req), id, input, getRequestContext(req)),
    );
  };

  suspend = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(suspendCustomerSchema, req.body ?? {});
    const id = requireIdParam(req, 'customer id');
    sendData(
      res,
      200,
      await this.status.suspend(requireActor(req), id, input, getRequestContext(req)),
    );
  };

  terminate = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(terminateCustomerSchema, req.body ?? {});
    const id = requireIdParam(req, 'customer id');
    sendData(
      res,
      200,
      await this.status.terminate(requireActor(req), id, input, getRequestContext(req)),
    );
  };

  activate = async (req: Request, res: Response): Promise<void> => {
    const id = requireIdParam(req, 'customer id');
    sendData(res, 200, await this.status.activate(requireActor(req), id, getRequestContext(req)));
  };
}
