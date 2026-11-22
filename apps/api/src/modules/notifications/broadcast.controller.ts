import { broadcastSchema } from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { BroadcastService } from './broadcast.service.js';

export class BroadcastController {
  constructor(private readonly service: BroadcastService) {}

  preview = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.preview(parseRequest(broadcastSchema, req.body)));
  };

  send = async (req: Request, res: Response): Promise<void> => {
    sendData(
      res,
      200,
      await this.service.send(
        requireActor(req),
        parseRequest(broadcastSchema, req.body),
        getRequestContext(req),
      ),
    );
  };
}
