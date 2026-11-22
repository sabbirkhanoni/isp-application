import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RouterError } from './router-gateway.js';
import { RouterOsRestGateway } from './routeros-rest-gateway.js';

/** A tiny RouterOS REST imitation: one PPPoE secret ("karim01") with one live session. */
const state = { disabled: 'false', sessionUp: true, log: [] as string[] };
let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const auth = req.headers.authorization;
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (auth !== `Basic ${Buffer.from('api:secret').toString('base64')}`) return send(401, {});
    const url = req.url ?? '';
    state.log.push(`${req.method} ${url}`);
    if (url.startsWith('/rest/system/resource'))
      return send(200, { version: '7.16', 'board-name': 'RB4011' });
    if (req.method === 'GET' && url === '/rest/ppp/secret?name=karim01') {
      return send(200, [{ '.id': '*1', name: 'karim01', disabled: state.disabled }]);
    }
    if (req.method === 'GET' && url === '/rest/ppp/secret') {
      return send(200, [
        { '.id': '*1', name: 'karim01', profile: 'p10', disabled: 'false' },
        { '.id': '*2', name: 'off02', profile: 'p5', disabled: 'true' },
      ]);
    }
    if (req.method === 'PUT' && url === '/rest/ppp/secret') {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        state.log.push(`CREATE ${body}`);
        send(201, { '.id': '*9' });
      });
      return;
    }
    if (req.method === 'GET' && url.startsWith('/rest/ppp/secret')) return send(200, []);
    if (req.method === 'PATCH' && url === '/rest/ppp/secret/*1') {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        state.disabled = (JSON.parse(body) as { disabled: string }).disabled;
        send(200, {});
      });
      return;
    }
    if (req.method === 'GET' && url === '/rest/interface?type=pppoe-in') {
      return send(200, [
        { name: '<pppoe-karim01>', 'rx-byte': '1200', 'tx-byte': '34000' },
        { name: 'ether1', 'rx-byte': '5', 'tx-byte': '5' },
      ]);
    }
    if (req.method === 'GET' && url === '/rest/ppp/active') {
      return send(200, [
        {
          name: 'karim01',
          address: '10.0.0.9',
          'caller-id': 'AA:BB',
          uptime: '1h2m',
          service: 'pppoe',
        },
        { name: 'vpn-user', address: '10.0.1.1', uptime: '5m', service: 'l2tp' },
      ]);
    }
    if (req.method === 'GET' && url === '/rest/ppp/active?name=karim01') {
      return send(200, state.sessionUp ? [{ '.id': '*A' }] : []);
    }
    if (req.method === 'DELETE' && url === '/rest/ppp/active/*A') {
      state.sessionUp = false;
      return send(204, null);
    }
    return send(404, { detail: 'no such command' });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const target = (over = {}) => ({
  host: '127.0.0.1',
  port,
  useTls: false,
  allowSelfSigned: false,
  username: 'api',
  password: 'secret',
  ...over,
});

describe('RouterOsRestGateway', () => {
  const gateway = new RouterOsRestGateway();

  it('disables the secret and drops the live session, then enables again', async () => {
    await gateway.setPppoeEnabled(target(), 'karim01', false);
    expect(state.disabled).toBe('true');
    expect(state.sessionUp).toBe(false);
    await gateway.setPppoeEnabled(target(), 'karim01', true);
    expect(state.disabled).toBe('false');
  });

  it('reports a missing PPPoE user as a permanent failure', async () => {
    await expect(gateway.setPppoeEnabled(target(), 'nobody', false)).rejects.toMatchObject({
      code: 'SECRET_NOT_FOUND',
      retryable: false,
    });
  });

  it('maps bad credentials and an unreachable host to retryable errors', async () => {
    await expect(gateway.ping(target({ password: 'wrong' }))).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
    const down = gateway.ping(target({ port: 1 }));
    await expect(down).rejects.toBeInstanceOf(RouterError);
    await expect(down).rejects.toMatchObject({ code: 'UNREACHABLE', retryable: true });
  });

  it('reads router identity for the connection test', async () => {
    expect(await gateway.ping(target())).toEqual({ identity: 'RB4011', version: '7.16' });
  });

  it('lists only PPPoE sessions', async () => {
    const sessions = await new RouterOsRestGateway().listSessions({
      host: '127.0.0.1',
      port,
      useTls: false,
      allowSelfSigned: false,
      username: 'api',
      password: 'secret',
    });
    expect(sessions).toEqual([
      {
        name: 'karim01',
        address: '10.0.0.9',
        callerId: 'AA:BB',
        uptime: '1h2m',
        rxBytes: 1200,
        txBytes: 34000,
      },
    ]);
  });

  it('creates a missing account only when a password is given', async () => {
    const gateway = new RouterOsRestGateway();
    await expect(
      gateway.setPppoeEnabled(target(), 'newuser', true, { profile: 'p10', password: null }),
    ).rejects.toMatchObject({ code: 'SECRET_NOT_FOUND' });
    const result = await gateway.setPppoeEnabled(target(), 'newuser', true, {
      profile: 'p10',
      password: 'pw123456',
    });
    expect(result).toEqual({ created: true });
    const created = state.log.find((l) => l.startsWith('CREATE '));
    expect(JSON.parse((created ?? '').slice(7))).toMatchObject({
      name: 'newuser',
      password: 'pw123456',
      profile: 'p10',
      service: 'pppoe',
      disabled: 'false',
    });
  });

  it('lists accounts with profile and disabled flag', async () => {
    expect(await new RouterOsRestGateway().listSecrets(target())).toEqual([
      { name: 'karim01', profile: 'p10', disabled: false },
      { name: 'off02', profile: 'p5', disabled: true },
    ]);
  });
});
