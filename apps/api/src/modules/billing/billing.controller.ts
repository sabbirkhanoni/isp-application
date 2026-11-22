import {
  billingSettingsSchema,
  generateInvoicesSchema,
  listInvoicesQuerySchema,
} from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor, requireIdParam } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { BillingService } from './billing.service.js';

export class BillingController {
  constructor(private readonly service: BillingService) {}

  listInvoices = async (req: Request, res: Response): Promise<void> => {
    const { items, pagination } = await this.service.list(
      parseRequest(listInvoicesQuerySchema, req.query),
    );
    sendData(res, 200, items, { pagination });
  };

  generate = async (req: Request, res: Response): Promise<void> => {
    const { period } = parseRequest(generateInvoicesSchema, req.body);
    sendData(
      res,
      200,
      await this.service.generateByAdmin(requireActor(req), period, getRequestContext(req)),
    );
  };

  invoiceDetail = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.invoiceDetail(requireIdParam(req, 'invoice id')));
  };

  getSettings = async (_req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.getSettings());
  };

  saveSettings = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(billingSettingsSchema, req.body);
    sendData(
      res,
      200,
      await this.service.saveSettings(requireActor(req), input, getRequestContext(req)),
    );
  };

  customerBilling = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.customerBilling(requireIdParam(req, 'customer id')));
  };
}
