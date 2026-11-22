import { createPackageSchema, updatePackageSchema } from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor, requireIdParam } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { PackageService } from './packages.service.js';

export class PackagesController {
  constructor(private readonly service: PackageService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.service.list(requireActor(req)));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(createPackageSchema, req.body);
    sendData(res, 201, await this.service.create(requireActor(req), input, getRequestContext(req)));
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(updatePackageSchema, req.body);
    const id = requireIdParam(req, 'package id');
    sendData(
      res,
      200,
      await this.service.update(requireActor(req), id, input, getRequestContext(req)),
    );
  };
}
