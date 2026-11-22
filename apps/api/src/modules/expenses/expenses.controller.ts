import { createExpenseSchema, listExpensesQuerySchema, updateExpenseSchema } from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor, requireIdParam } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { ExpensesService } from './expenses.service.js';

export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { items, pagination, totalPoisha } = await this.service.list(
      parseRequest(listExpensesQuerySchema, req.query),
    );
    sendData(res, 200, items, { pagination, totalPoisha });
  };

  csv = async (req: Request, res: Response): Promise<void> => {
    const query = parseRequest(listExpensesQuerySchema, req.query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="expenses.csv"');
    res.send(await this.service.csv(query));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(createExpenseSchema, req.body);
    sendData(res, 201, await this.service.create(requireActor(req), input, getRequestContext(req)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(updateExpenseSchema, req.body);
    const id = requireIdParam(req, 'expense id');
    sendData(
      res,
      200,
      await this.service.update(requireActor(req), id, input, getRequestContext(req)),
    );
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.service.delete(
      requireActor(req),
      requireIdParam(req, 'expense id'),
      getRequestContext(req),
    );
    sendData(res, 200, { deleted: true });
  };
}
