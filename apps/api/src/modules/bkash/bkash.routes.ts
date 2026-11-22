import express, { Router, type RequestHandler } from 'express';
import type { AuthorizeFactory } from '../../shared/middleware/authorize.js';
import type { BkashController } from './bkash.controller.js';

interface Dependencies {
  controller: BkashController;
  authenticate: RequestHandler;
  authorize: AuthorizeFactory;
}

/** Public: the SMS forwarder on the owner's phone posts here with its secret token. */
export function createBkashHookRouter(controller: BkashController, rateLimiter: RequestHandler) {
  const router = Router();
  router.post('/bkash-sms', rateLimiter, express.json({ limit: '10kb' }), controller.receiveSms);
  return router;
}

export function createBkashRouter({ controller, authenticate, authorize }: Dependencies) {
  const router = Router();
  router.use(authenticate, authorize('BKASH_RECONCILE'));
  // A month of statement rows as text is larger than a normal body; parsed only for logged-in admins.
  router.post('/imports', express.json({ limit: '3mb' }), controller.importStatement);
  router.get('/hook', authorize('SYSTEM_SETTINGS_WRITE'), controller.hookStatus);
  router.post('/hook/enable', authorize('SYSTEM_SETTINGS_WRITE'), controller.enableHook);
  router.post('/hook/disable', authorize('SYSTEM_SETTINGS_WRITE'), controller.disableHook);
  router.put('/hook/auto-match', authorize('SYSTEM_SETTINGS_WRITE'), controller.setHookAutoMatch);
  router.get('/transactions', controller.list);
  router.post('/transactions/:id/assign', controller.assign);
  router.post('/transactions/:id/ignore', controller.ignore);
  return router;
}
