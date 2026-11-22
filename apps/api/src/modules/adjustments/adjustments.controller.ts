import { createChargeSchema, setDiscountSchema } from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { AdjustmentsService } from './adjustments.service.js';

export class AdjustmentsController {
  constructor(private readonly service: AdjustmentsService) {}

  addCharge = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(createChargeSchema, req.body);
    sendData(
      res,
      201,
      await this.service.addCharge(
        requireActor(req),
        String(req.params['customerId']),
        input,
        getRequestContext(req),
      ),
    );
  };

  cancelCharge = async (req: Request, res: Response): Promise<void> => {
    await this.service.cancelCharge(
      requireActor(req),
      String(req.params['chargeId']),
      getRequestContext(req),
    );
    res.status(204).end();
  };

  setDiscount = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(setDiscountSchema, req.body);
    await this.service.setDiscount(
      requireActor(req),
      String(req.params['customerId']),
      input,
      getRequestContext(req),
    );
    res.status(204).end();
  };
}
