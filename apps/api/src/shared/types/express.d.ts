import type { AuthContext } from '../../modules/auth/auth.types.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the router-agent bearer-token middleware. */
    agentRouterId?: string;
    requestId: string;
    auth?: AuthContext;
  }
}
