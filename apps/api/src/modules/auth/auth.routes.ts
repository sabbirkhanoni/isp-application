import { Router, type RequestHandler } from 'express';
import type { AuthController } from './auth.controller.js';

interface Dependencies {
  controller: AuthController;
  authenticate: RequestHandler;
  loginRateLimiter: RequestHandler;
}

export function createAuthRouter({ controller, authenticate, loginRateLimiter }: Dependencies) {
  const router = Router();
  router.post('/login', loginRateLimiter, controller.login);
  router.post('/logout', authenticate, controller.logout);
  router.get('/me', authenticate, controller.me);
  router.post('/change-password', authenticate, controller.changePassword);
  router.patch('/me/preferences', authenticate, controller.updatePreferences);
  return router;
}
