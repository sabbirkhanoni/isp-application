import { searchQuerySchema } from '@isp/contracts';
import type { Request, Response } from 'express';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { sendData } from '../../shared/utils/response.js';
import type { SearchRepository } from './search.repository.js';

export class SearchController {
  constructor(private readonly repo: SearchRepository) {}

  search = async (req: Request, res: Response): Promise<void> => {
    const { q } = parseRequest(searchQuerySchema, req.query);
    sendData(res, 200, await this.repo.customers(q, 8));
  };
}
