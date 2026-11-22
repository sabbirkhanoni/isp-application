import {
  assignBkashTransactionSchema,
  ignoreBkashTransactionSchema,
  importBkashStatementSchema,
  listBkashTransactionsQuerySchema,
} from '@isp/contracts';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireActor, requireIdParam } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { BkashService } from './bkash.service.js';

export class BkashController {
  constructor(private readonly service: BkashService) {}

  importStatement = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(importBkashStatementSchema, req.body);
    sendData(
      res,
      200,
      await this.service.importStatement(requireActor(req), input, getRequestContext(req)),
    );
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, pagination, needsReview } = await this.service.list(
      parseRequest(listBkashTransactionsQuerySchema, req.query),
    );
    sendData(res, 200, items, { pagination, needsReview });
  };

  assign = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(assignBkashTransactionSchema, req.body);
    const id = requireIdParam(req, 'transaction id');
    sendData(
      res,
      200,
      await this.service.assign(requireActor(req), id, input, getRequestContext(req)),
    );
  };

  ignore = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(ignoreBkashTransactionSchema, req.body);
    const id = requireIdParam(req, 'transaction id');
    sendData(
      res,
      200,
      await this.service.ignore(requireActor(req), id, input, getRequestContext(req)),
    );
  };

  hookStatus = async (_req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.hookStatus());
  };

  enableHook = async (req: Request, res: Response): Promise<void> => {
    const token = await this.service.enableHook(requireActor(req), getRequestContext(req));
    sendData(res, 200, { token });
  };

  disableHook = async (req: Request, res: Response): Promise<void> => {
    await this.service.disableHook(requireActor(req), getRequestContext(req));
    sendData(res, 200, { ok: true });
  };

  setHookAutoMatch = async (req: Request, res: Response): Promise<void> => {
    const { autoMatchByPhone } = parseRequest(
      z.object({ autoMatchByPhone: z.boolean() }),
      req.body,
    );
    await this.service.setHookAutoMatch(requireActor(req), autoMatchByPhone);
    sendData(res, 200, { ok: true });
  };

  /** Public endpoint for the phone's SMS forwarder: Authorization: Bearer <token>, body {message}. */
  receiveSms = async (req: Request, res: Response): Promise<void> => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const body = req.body as { message?: unknown; text?: unknown } | undefined;
    const raw = body?.message ?? body?.text;
    const message = typeof raw === 'string' ? raw.slice(0, 1000) : '';
    const result = token
      ? await this.service.ingestSms(token, message, getRequestContext(req))
      : null;
    if (result === null) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token.' } });
      return;
    }
    sendData(res, 200, { result });
  };
}
