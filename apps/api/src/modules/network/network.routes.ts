import { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import { UnauthenticatedError } from '../../shared/errors/app-error.js';
import type { NetworkController } from './network.controller.js';
import type { RouterService } from './routers.service.js';

interface AdminDependencies {
  controller: NetworkController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

export function createRoutersRouter({ controller, authenticate, authorize }: AdminDependencies) {
  const router = Router();
  router.use(authenticate);
  router.get('/', authorize('ROUTER_CONFIG_WRITE'), controller.listRouters);
  router.post('/', authorize('ROUTER_CONFIG_WRITE'), controller.createRouter);
  router.patch('/:id', authorize('ROUTER_CONFIG_WRITE'), controller.updateRouter);
  router.post('/:id/test', authorize('ROUTER_CONFIG_WRITE'), controller.testRouter);
  router.post('/:id/refresh', authorize('ROUTER_CONFIG_WRITE'), controller.refreshSecrets);
  router.get('/:id/compare', authorize('ROUTER_CONFIG_WRITE'), controller.compare);
  router.post('/:id/fix', authorize('ROUTER_CONFIG_WRITE'), controller.fix);
  router.get('/:id/router-only.csv', authorize('ROUTER_CONFIG_WRITE'), controller.routerOnlyCsv);
  router.post('/:id/token', authorize('ROUTER_CONFIG_WRITE'), controller.rotateToken);
  return router;
}

export function createNetworkJobsRouter({
  controller,
  authenticate,
  authorize,
}: AdminDependencies) {
  const router = Router();
  router.use(authenticate);
  router.get('/', authorize('ROUTER_CONFIG_WRITE'), controller.listJobs);
  router.post('/:id/retry', authorize('ROUTER_CONFIG_WRITE'), controller.retryJob);
  return router;
}

/** Live line status: staff need it to answer "is the customer's line up?". */
export function createLinesRouter({ controller, authenticate, authorize }: AdminDependencies) {
  const router = Router();
  router.use(authenticate);
  router.get('/', authorize('CUSTOMER_READ'), controller.listLines);
  router.get('/customer/:id', authorize('CUSTOMER_READ'), controller.lineOfCustomer);
  // Live tools: support staff may check and restart a line; locking a MAC is an admin decision.
  router.post('/customer/:id/ping', authorize('CUSTOMER_READ'), controller.livePing);
  router.post('/customer/:id/kick', authorize('CUSTOMER_READ'), controller.liveKick);
  router.get('/customer/:id/traffic', authorize('CUSTOMER_READ'), controller.liveTraffic);
  router.get('/customer/:id/mac', authorize('CUSTOMER_READ'), controller.macState);
  router.post('/customer/:id/mac/lock', authorize('ROUTER_CONFIG_WRITE'), controller.macLock);
  router.post('/customer/:id/mac/reset', authorize('ROUTER_CONFIG_WRITE'), controller.macReset);
  router.get('/customer/:id/password', authorize('ROUTER_CONFIG_WRITE'), controller.pppoePassword);
  return router;
}

/** Bearer-token middleware for the router agent: identifies the router and nothing else. */
function createAgentAuth(routers: RouterService): RequestHandler {
  return async (req, _res, next) => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const router = token ? await routers.authenticateAgent(token) : null;
    if (!router) return next(new UnauthenticatedError());
    req.agentRouterId = router.id;
    return next();
  };
}

export function createAgentRouter(deps: {
  controller: NetworkController;
  routers: RouterService;
  rateLimiter: RequestHandler;
}) {
  const router = Router();
  router.use(deps.rateLimiter);
  router.use(createAgentAuth(deps.routers));
  router.post('/claim', deps.controller.agentClaim);
  router.post('/sessions', deps.controller.agentSessions);
  router.post('/jobs/:id/result', deps.controller.agentReport);
  return router;
}
