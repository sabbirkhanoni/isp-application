import {
  listDuesQuerySchema,
  profitQuerySchema,
  reportPeriodQuerySchema,
  trendQuerySchema,
} from '@isp/contracts';
import type { Request, Response } from 'express';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { sendData } from '../../shared/utils/response.js';
import type { ReportsService } from './reports.service.js';

function sendCsv(res: Response, filename: string, body: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(body);
}

export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  summary = async (req: Request, res: Response): Promise<void> => {
    const { period } = parseRequest(reportPeriodQuerySchema, req.query);
    sendData(res, 200, await this.service.summary(period));
  };

  trend = async (req: Request, res: Response): Promise<void> => {
    const { months } = parseRequest(trendQuerySchema, req.query);
    sendData(res, 200, await this.service.trend(months));
  };

  dues = async (req: Request, res: Response): Promise<void> => {
    const { items, pagination } = await this.service.dues(
      parseRequest(listDuesQuerySchema, req.query),
    );
    sendData(res, 200, items, { pagination });
  };

  duesCsv = async (req: Request, res: Response): Promise<void> => {
    const { search, overdueOnly } = parseRequest(listDuesQuerySchema, req.query);
    sendCsv(res, 'dues.csv', await this.service.duesCsv({ search, overdueOnly }));
  };

  profit = async (req: Request, res: Response): Promise<void> => {
    const { period, months } = parseRequest(profitQuerySchema, req.query);
    sendData(res, 200, await this.service.profit(period, months));
  };

  profitCsv = async (req: Request, res: Response): Promise<void> => {
    const { period, months } = parseRequest(profitQuerySchema, req.query);
    sendCsv(res, 'profit-loss.csv', await this.service.profitCsv(period, months));
  };

  collectors = async (req: Request, res: Response): Promise<void> => {
    const { period } = parseRequest(reportPeriodQuerySchema, req.query);
    sendData(res, 200, await this.service.collectors(period));
  };

  collectorsCsv = async (req: Request, res: Response): Promise<void> => {
    const { period } = parseRequest(reportPeriodQuerySchema, req.query);
    sendCsv(res, 'collectors.csv', await this.service.collectorsCsv(period));
  };

  areas = async (req: Request, res: Response): Promise<void> => {
    const { period } = parseRequest(reportPeriodQuerySchema, req.query);
    sendData(res, 200, await this.service.areas(period));
  };

  areasCsv = async (req: Request, res: Response): Promise<void> => {
    const { period } = parseRequest(reportPeriodQuerySchema, req.query);
    sendCsv(res, 'areas.csv', await this.service.areasCsv(period));
  };

  churn = async (req: Request, res: Response): Promise<void> => {
    const { months } = parseRequest(profitQuerySchema, req.query);
    sendData(res, 200, await this.service.churn(months));
  };

  collectionsCsv = async (req: Request, res: Response): Promise<void> => {
    const { period } = parseRequest(reportPeriodQuerySchema, req.query);
    sendCsv(
      res,
      `collections-${period ?? 'current'}.csv`,
      await this.service.collectionsCsv(period),
    );
  };
}
