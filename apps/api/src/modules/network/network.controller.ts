import {
  agentJobResultSchema,
  agentSessionsSchema,
  createRouterSchema,
  listLinesQuerySchema,
  listNetworkJobsQuerySchema,
  lockMacSchema,
  updateRouterSchema,
} from '@isp/contracts';
import type { Request, Response } from 'express';
import { requireActor, requireIdParam } from '../../shared/utils/http-helpers.js';
import { parseRequest } from '../../shared/utils/parse-request.js';
import { getRequestContext } from '../../shared/utils/request-context.js';
import { sendData } from '../../shared/utils/response.js';
import type { LiveToolsService } from './live-tools.service.js';
import type { NetworkService } from './network.service.js';
import type { RouterService } from './routers.service.js';

export class NetworkController {
  constructor(
    private readonly routers: RouterService,
    private readonly network: NetworkService,
    private readonly live: LiveToolsService,
  ) {}

  listRouters = async (_req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.routers.list());
  };

  createRouter = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(createRouterSchema, req.body);
    sendData(res, 201, await this.routers.create(requireActor(req), input, getRequestContext(req)));
  };

  updateRouter = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(updateRouterSchema, req.body);
    const id = requireIdParam(req, 'router id');
    sendData(
      res,
      200,
      await this.routers.update(requireActor(req), id, input, getRequestContext(req)),
    );
  };

  rotateToken = async (req: Request, res: Response): Promise<void> => {
    const id = requireIdParam(req, 'router id');
    sendData(
      res,
      200,
      await this.routers.rotateToken(requireActor(req), id, getRequestContext(req)),
    );
  };

  refreshSecrets = async (req: Request, res: Response): Promise<void> => {
    await this.network.refreshSecrets(requireIdParam(req, 'router id'));
    sendData(res, 200, { refreshed: true });
  };

  compare = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.network.compare(requireIdParam(req, 'router id')));
  };

  fix = async (req: Request, res: Response): Promise<void> => {
    const id = requireIdParam(req, 'router id');
    sendData(res, 200, await this.network.fix(requireActor(req), id, getRequestContext(req)));
  };

  routerOnlyCsv = async (req: Request, res: Response): Promise<void> => {
    const csv = await this.network.routerOnlyCsv(requireIdParam(req, 'router id'));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="router-only-accounts.csv"');
    res.send(csv);
  };

  pppoePassword = async (req: Request, res: Response): Promise<void> => {
    const id = requireIdParam(req, 'customer id');
    sendData(
      res,
      200,
      await this.network.revealPppoePassword(requireActor(req), id, getRequestContext(req)),
    );
  };

  testRouter = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.routers.test(requireIdParam(req, 'router id')));
  };

  listJobs = async (req: Request, res: Response): Promise<void> => {
    const { items, pagination, needsAttention } = await this.network.listJobs(
      parseRequest(listNetworkJobsQuerySchema, req.query),
    );
    sendData(res, 200, items, { pagination, needsAttention });
  };

  retryJob = async (req: Request, res: Response): Promise<void> => {
    const id = requireIdParam(req, 'job id');
    await this.network.retryJob(requireActor(req), id, getRequestContext(req));
    sendData(res, 200, { queued: true });
  };

  listLines = async (req: Request, res: Response): Promise<void> => {
    const { items, pagination, summary } = await this.network.listLines(
      parseRequest(listLinesQuerySchema, req.query),
    );
    sendData(res, 200, items, { pagination, summary });
  };

  lineOfCustomer = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.network.lineOf(requireIdParam(req, 'customer id')));
  };

  // ---- live tools on one customer's line ----
  livePing = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.live.ping(requireIdParam(req, 'customer id')));
  };

  liveKick = async (req: Request, res: Response): Promise<void> => {
    const id = requireIdParam(req, 'customer id');
    sendData(res, 200, await this.live.kick(requireActor(req), id, getRequestContext(req)));
  };

  liveTraffic = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.live.traffic(requireIdParam(req, 'customer id')));
  };

  macState = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.live.macState(requireIdParam(req, 'customer id')));
  };

  macLock = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(lockMacSchema, req.body ?? {});
    const id = requireIdParam(req, 'customer id');
    sendData(
      res,
      200,
      await this.live.lockMac(requireActor(req), id, input.mac, getRequestContext(req)),
    );
  };

  macReset = async (req: Request, res: Response): Promise<void> => {
    const id = requireIdParam(req, 'customer id');
    sendData(res, 200, await this.live.resetMac(requireActor(req), id, getRequestContext(req)));
  };

  // ---- agent (authenticated by bearer token, not by session) ----
  agentClaim = async (req: Request, res: Response): Promise<void> => {
    sendData(res, 200, await this.network.agentClaim(this.agentRouterId(req)));
  };

  agentSessions = async (req: Request, res: Response): Promise<void> => {
    const input = parseRequest(agentSessionsSchema, req.body);
    await this.network.agentSessions(this.agentRouterId(req), input);
    sendData(res, 200, { recorded: input.sessions.length });
  };

  agentReport = async (req: Request, res: Response): Promise<void> => {
    const result = parseRequest(agentJobResultSchema, req.body);
    await this.network.agentReport(this.agentRouterId(req), requireIdParam(req, 'job id'), result);
    sendData(res, 200, { recorded: true });
  };

  private agentRouterId(req: Request): string {
    if (!req.agentRouterId) throw new Error('agent authentication middleware missing');
    return req.agentRouterId;
  }
}
