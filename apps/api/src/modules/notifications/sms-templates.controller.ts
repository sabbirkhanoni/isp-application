import { SMS_TEMPLATE_TYPES, updateSmsTemplateSchema, type SmsTemplateType } from '@isp/contracts';
import type { Request, Response } from 'express';
import { ValidationError } from '../../shared/errors/app-error.js';
import { requireActor } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { SmsTemplateService } from './sms-template.service.js';

function typeParam(req: Request): SmsTemplateType {
  const type = SMS_TEMPLATE_TYPES.find((t) => t === req.params['type']);
  if (!type) throw new ValidationError('Unknown message type.');
  return type;
}

export class SmsTemplatesController {
  constructor(private readonly service: SmsTemplateService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.list());
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { template } = parseRequest(updateSmsTemplateSchema, req.body);
    sendData(
      res,
      200,
      await this.service.update(
        requireActor(req),
        typeParam(req),
        template,
        getRequestContext(req),
      ),
    );
  };

  reset = async (req: Request, res: Response): Promise<void> => {
    sendData(
      res,
      200,
      await this.service.reset(requireActor(req), typeParam(req), getRequestContext(req)),
    );
  };
}
