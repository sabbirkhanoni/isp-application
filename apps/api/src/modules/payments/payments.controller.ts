import {
  listPaymentsQuerySchema,
  movePaymentSchema,
  recordPaymentSchema,
  reversePaymentSchema,
} from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor, requireIdParam } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { PaymentService } from './payments.service.js';

export class PaymentsController {
  constructor(private readonly service: PaymentService) {}

  record = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(recordPaymentSchema, req.body);
    sendData(res, 201, await this.service.record(requireActor(req), input, getRequestContext(req)));
  };

  reverse = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(reversePaymentSchema, req.body);
    const id = requireIdParam(req, 'payment id');
    sendData(
      res,
      200,
      await this.service.reverse(requireActor(req), id, input, getRequestContext(req)),
    );
  };

  move = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(movePaymentSchema, req.body);
    const id = requireIdParam(req, 'payment id');
    sendData(
      res,
      200,
      await this.service.move(requireActor(req), id, input, getRequestContext(req)),
    );
  };

  receipt = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.receipt(requireIdParam(req, 'payment id')));
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, pagination } = await this.service.list(
      parseRequest(listPaymentsQuerySchema, req.query),
    );
    sendData(res, 200, items, { pagination });
  };
}
