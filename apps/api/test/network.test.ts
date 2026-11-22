import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { RouterError } from '../src/modules/network/router-gateway.js';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let packageId: string;
let admin: Awaited<ReturnType<typeof loginAs>>;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-02T04:00:00Z');
  ctx.router.calls.length = 0;
  ctx.router.failWith = null;
  packageId = (
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
    })
  ).id;
  admin = await loginAs(ctx.app, ADMIN);
});

const restRouter = (name = 'Core-1') => ({
  name,
  driver: 'REST',
  host: '10.0.0.1',
  port: 443,
  useTls: true,
  allowSelfSigned: true,
  username: 'api-user',
  password: 'router-pass',
});

async function addRouter(body: object = restRouter()) {
  const res = await admin.post('/api/v1/routers').send(body);
  expect(res.status).toBe(201);
  return res.body.data as { router: { id: string }; agentToken: string | null };
}

async function addCustomer(
  opts: { routerId?: string; policy?: string; pppoe?: string; type?: string } = {},
) {
  const res = await admin.post('/api/v1/customers').send({
    fullName: 'Karim Mia',
    phone: '01711223344',
    address: 'House 5, Road 2',
    packageId,
    connectionType: opts.type ?? 'PPPOE',
    pppoeUsername: opts.pppoe ?? 'karim01',
    activationPolicy: opts.policy ?? 'ACTIVATE_NOW',
    ...(opts.routerId ? { routerId: opts.routerId } : {}),
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

const jobs = () => ctx.db.networkJob.findMany({ orderBy: { createdAt: 'asc' } });

describe('routers', () => {
  it('stores the password encrypted and never returns it', async () => {
    const { router } = await addRouter();
    const row = await ctx.db.router.findUniqueOrThrow({ where: { id: router.id } });
    expect(row.passwordEnc).not.toBeNull();
    expect(row.passwordEnc).not.toContain('router-pass');

    const list = await admin.get('/api/v1/routers');
    expect(list.body.data[0]).toMatchObject({
      name: 'Core-1',
      hasPassword: true,
      customerCount: 0,
    });
    expect(JSON.stringify(list.body)).not.toContain('router-pass');
  });

  it('validates input, rejects duplicates and is admin-only', async () => {
    const bad = await admin.post('/api/v1/routers').send({ name: 'X1', driver: 'REST' });
    expect(bad.status).toBe(400);
    await addRouter();
    expect((await admin.post('/api/v1/routers').send(restRouter('core-1'))).status).toBe(409);

    const staff = await loginAs(ctx.app, STAFF);
    expect((await staff.get('/api/v1/routers')).status).toBe(403);
    expect((await staff.get('/api/v1/network-jobs')).status).toBe(403);
  });

  it('tests a direct connection and records the failure reason', async () => {
    const { router } = await addRouter();
    const ok = await admin.post(`/api/v1/routers/${router.id}/test`);
    expect(ok.body.data).toMatchObject({ ok: true });

    ctx.router.failWith = new RouterError('UNREACHABLE', 'Cannot reach the router', true);
    const down = await admin.post(`/api/v1/routers/${router.id}/test`);
    expect(down.body.data).toMatchObject({ ok: false, message: 'Cannot reach the router' });
    const list = await admin.get('/api/v1/routers');
    expect(list.body.data[0].lastError).toBe('Cannot reach the router');
  });

  it('refuses to save a customer on an inactive router', async () => {
    const { router } = await addRouter();
    await admin.patch(`/api/v1/routers/${router.id}`).send({ isActive: false });
    const res = await admin.post('/api/v1/customers').send({
      fullName: 'Karim Mia',
      phone: '01711223344',
      address: 'House 5',
      packageId,
      connectionType: 'PPPOE',
      pppoeUsername: 'karim01',
      activationPolicy: 'ACTIVATE_NOW',
      routerId: router.id,
    });
    expect(res.status).toBe(400);
  });
});

describe('suspend and reconnect', () => {
  it('queues a job, disables the PPPoE user, then enables it again', async () => {
    const { router } = await addRouter();
    const customer = await addCustomer({ routerId: router.id });
    await ctx.network.runDue(); // the creation job (ACTIVATE_NOW) switches the user on
    expect(ctx.router.calls).toEqual([{ host: '10.0.0.1', user: 'karim01', enabled: true }]);

    const suspended = await admin.post(`/api/v1/customers/${customer.id}/suspend`).send({});
    expect(suspended.body.data).toMatchObject({
      status: 'SUSPENDED',
      suspendReason: 'NON_PAYMENT',
    });
    expect(await ctx.network.runDue()).toEqual({ done: 1, retried: 0, failed: 0 });
    expect(ctx.router.calls.at(-1)).toMatchObject({ user: 'karim01', enabled: false });

    const active = await admin.post(`/api/v1/customers/${customer.id}/activate`);
    expect(active.body.data).toMatchObject({ status: 'ACTIVE', suspendReason: null });
    await ctx.network.runDue();
    expect(ctx.router.calls.at(-1)).toMatchObject({ enabled: true });
    expect((await jobs()).every((j) => j.status === 'DONE')).toBe(true);
  });

  it('collapses repeated changes into one waiting job that follows the latest status', async () => {
    const { router } = await addRouter();
    const customer = await addCustomer({ routerId: router.id });
    await ctx.network.runDue();
    ctx.router.calls.length = 0;

    await admin.post(`/api/v1/customers/${customer.id}/suspend`).send({});
    await admin.post(`/api/v1/customers/${customer.id}/activate`);
    const pending = (await jobs()).filter((j) => j.status === 'PENDING');
    expect(pending).toHaveLength(1);
    await ctx.network.runDue();
    expect(ctx.router.calls).toEqual([{ host: '10.0.0.1', user: 'karim01', enabled: true }]);
  });

  it('does not queue anything for customers the system cannot manage', async () => {
    const { router } = await addRouter();
    await addCustomer({ type: 'DHCP', pppoe: '', routerId: router.id });
    expect(await jobs()).toHaveLength(0);
  });

  it('rejects wrong transitions and non-admins', async () => {
    const customer = await addCustomer();
    expect((await admin.post(`/api/v1/customers/${customer.id}/activate`)).status).toBe(409);
    const staff = await loginAs(ctx.app, STAFF);
    expect((await staff.post(`/api/v1/customers/${customer.id}/suspend`).send({})).status).toBe(
      403,
    );
    await admin.post(`/api/v1/customers/${customer.id}/suspend`).send({});
    expect((await admin.post(`/api/v1/customers/${customer.id}/suspend`).send({})).status).toBe(
      409,
    );
  });

  it('switches the user on after the first payment', async () => {
    const { router } = await addRouter();
    const customer = await addCustomer({ routerId: router.id, policy: 'AFTER_FIRST_PAYMENT' });
    expect(await jobs()).toHaveLength(0);
    await ctx.billing.generateForPeriod();
    await admin
      .post('/api/v1/payments')
      .send({ customerId: customer.id, amountPoisha: 50000, method: 'CASH' });
    expect(await jobs()).toHaveLength(1);
    await ctx.network.runDue();
    expect(ctx.router.calls).toEqual([{ host: '10.0.0.1', user: 'karim01', enabled: true }]);
  });

  it('moves a customer to another router when it is changed', async () => {
    const a = await addRouter();
    const b = await addRouter(restRouter('Core-2'));
    const customer = await addCustomer({ routerId: a.router.id });
    await ctx.network.runDue();
    await admin.patch(`/api/v1/customers/${customer.id}`).send({ routerId: b.router.id });
    const pending = (await jobs()).filter((j) => j.status === 'PENDING');
    expect(pending).toHaveLength(1);
    expect(pending[0]?.routerId).toBe(b.router.id);
  });
});

describe('failures', () => {
  it('retries an unreachable router later with a delay', async () => {
    const { router } = await addRouter();
    await addCustomer({ routerId: router.id });
    ctx.router.failWith = new RouterError('UNREACHABLE', 'Cannot reach the router', true);

    expect(await ctx.network.runDue()).toEqual({ done: 0, retried: 1, failed: 0 });
    const [job] = await jobs();
    expect(job).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      lastError: 'Cannot reach the router',
    });

    expect(await ctx.network.runDue()).toEqual({ done: 0, retried: 0, failed: 0 }); // not due yet
    ctx.router.failWith = null;
    ctx.clock.set('2026-11-02T04:02:00Z');
    expect(await ctx.network.runDue()).toEqual({ done: 1, retried: 0, failed: 0 });
  });

  it('gives up after repeated failures and lets the admin retry', async () => {
    const { router } = await addRouter();
    await addCustomer({ routerId: router.id });
    ctx.router.failWith = new RouterError('UNREACHABLE', 'Cannot reach the router', true);
    for (let i = 0; i < 5; i += 1) {
      await ctx.network.runDue();
      ctx.clock.set(new Date(ctx.clock.now().getTime() + 2 * 3600_000).toISOString());
    }
    expect((await jobs())[0]).toMatchObject({ status: 'FAILED', attempts: 5 });
  });

  it('fails at once when the PPPoE user is missing, and clears the alert after a retry succeeds', async () => {
    const { router } = await addRouter();
    await addCustomer({ routerId: router.id });
    ctx.router.failWith = new RouterError('SECRET_NOT_FOUND', 'PPPoE user does not exist', false);
    expect(await ctx.network.runDue()).toEqual({ done: 0, retried: 0, failed: 1 });

    const failed = await admin.get('/api/v1/network-jobs?status=FAILED');
    expect(failed.body.meta.needsAttention).toBe(1);
    expect(failed.body.data[0]).toMatchObject({ customerName: 'Karim Mia', routerName: 'Core-1' });

    ctx.router.failWith = null;
    const retry = await admin.post(`/api/v1/network-jobs/${failed.body.data[0].id}/retry`);
    expect(retry.status).toBe(200);
    await ctx.network.runDue();
    const after = await admin.get('/api/v1/network-jobs?status=FAILED');
    expect(after.body.meta.needsAttention).toBe(0);
  });
});

describe('payment and overdue rules', () => {
  async function overdueCustomer(reason: 'NON_PAYMENT' | 'MANUAL') {
    const { router } = await addRouter();
    const customer = await addCustomer({ routerId: router.id });
    await ctx.billing.generateForPeriod(); // Nov invoice, due 10 Nov
    ctx.clock.set('2026-11-20T04:00:00Z');
    await admin.post(`/api/v1/customers/${customer.id}/suspend`).send({ reason });
    await ctx.network.runDue();
    ctx.router.calls.length = 0;
    return customer;
  }

  it('reconnects a non-payment suspension when the overdue bill is paid', async () => {
    const customer = await overdueCustomer('NON_PAYMENT');
    await admin
      .post('/api/v1/payments')
      .send({ customerId: customer.id, amountPoisha: 50000, method: 'CASH' });
    const got = await admin.get(`/api/v1/customers/${customer.id}`);
    expect(got.body.data.status).toBe('ACTIVE');
    await ctx.network.runDue();
    expect(ctx.router.calls).toEqual([{ host: '10.0.0.1', user: 'karim01', enabled: true }]);
  });

  it('keeps a customer suspended after a part-payment', async () => {
    const customer = await overdueCustomer('NON_PAYMENT');
    await admin
      .post('/api/v1/payments')
      .send({ customerId: customer.id, amountPoisha: 20000, method: 'CASH' });
    expect((await admin.get(`/api/v1/customers/${customer.id}`)).body.data.status).toBe(
      'SUSPENDED',
    );
  });

  it('never reconnects a manual suspension automatically', async () => {
    const customer = await overdueCustomer('MANUAL');
    await admin
      .post('/api/v1/payments')
      .send({ customerId: customer.id, amountPoisha: 50000, method: 'CASH' });
    expect((await admin.get(`/api/v1/customers/${customer.id}`)).body.data.status).toBe(
      'SUSPENDED',
    );
  });

  it('auto-suspends only after the grace period, and only when asked to', async () => {
    const { router } = await addRouter();
    const customer = await addCustomer({ routerId: router.id });
    await ctx.billing.generateForPeriod(); // due 10 Nov

    ctx.clock.set('2026-11-12T04:00:00Z'); // 2 days late: inside grace
    expect(await ctx.customerStatus.autoSuspendOverdue(3)).toBe(0);
    ctx.clock.set('2026-11-14T04:00:00Z'); // 4 days late
    expect(await ctx.customerStatus.autoSuspendOverdue(3)).toBe(1);
    expect(await ctx.customerStatus.autoSuspendOverdue(3)).toBe(0); // idempotent
    const got = await admin.get(`/api/v1/customers/${customer.id}`);
    expect(got.body.data).toMatchObject({ status: 'SUSPENDED', suspendReason: 'NON_PAYMENT' });
  });
});

describe('router agent', () => {
  it('lets an agent claim and complete jobs with its own token', async () => {
    const { router, agentToken } = await addRouter({ name: 'Edge-1', driver: 'AGENT' });
    expect(agentToken).toMatch(/^[0-9a-f-]{36}\./);
    const customer = await addCustomer({ routerId: router.id });
    await admin.post(`/api/v1/customers/${customer.id}/suspend`).send({});

    const claim = await request(ctx.app)
      .post('/api/v1/agent/claim')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(claim.status).toBe(200);
    expect(claim.body.data).toEqual([
      expect.objectContaining({ pppoeUsername: 'karim01', desiredState: 'DISABLED' }),
    ]);
    expect(ctx.router.calls).toHaveLength(0); // the server never touches an agent router

    const jobId = claim.body.data[0].id as string;
    const done = await request(ctx.app)
      .post(`/api/v1/agent/jobs/${jobId}/result`)
      .set('Authorization', `Bearer ${agentToken}`)
      .send({ ok: true });
    expect(done.status).toBe(200);
    expect((await jobs())[0]).toMatchObject({ status: 'DONE', appliedState: 'DISABLED' });

    const again = await request(ctx.app)
      .post('/api/v1/agent/claim')
      .set('Authorization', `Bearer ${agentToken}`);
    expect(again.body.data).toEqual([]);
  });

  it('rejects missing, wrong and rotated tokens', async () => {
    const { router, agentToken } = await addRouter({ name: 'Edge-1', driver: 'AGENT' });
    expect((await request(ctx.app).post('/api/v1/agent/claim')).status).toBe(401);
    const wrong = `${router.id}.not-the-secret`;
    expect(
      (await request(ctx.app).post('/api/v1/agent/claim').set('Authorization', `Bearer ${wrong}`))
        .status,
    ).toBe(401);

    const rotated = await admin.post(`/api/v1/routers/${router.id}/token`);
    expect(rotated.body.data.agentToken).not.toBe(agentToken);
    expect(
      (
        await request(ctx.app)
          .post('/api/v1/agent/claim')
          .set('Authorization', `Bearer ${agentToken}`)
      ).status,
    ).toBe(401);
  });

  it('does not let one agent report on another router’s job', async () => {
    const a = await addRouter({ name: 'Edge-1', driver: 'AGENT' });
    const b = await addRouter({ name: 'Edge-2', driver: 'AGENT' });
    const customer = await addCustomer({ routerId: a.router.id });
    await admin.post(`/api/v1/customers/${customer.id}/suspend`).send({});
    const claim = await request(ctx.app)
      .post('/api/v1/agent/claim')
      .set('Authorization', `Bearer ${a.agentToken}`);
    const res = await request(ctx.app)
      .post(`/api/v1/agent/jobs/${claim.body.data[0].id}/result`)
      .set('Authorization', `Bearer ${b.agentToken}`)
      .send({ ok: true });
    expect(res.status).toBe(404);
  });

  it('retries a job whose agent never reported (stale claim)', async () => {
    const { router, agentToken } = await addRouter({ name: 'Edge-1', driver: 'AGENT' });
    const customer = await addCustomer({ routerId: router.id });
    await admin.post(`/api/v1/customers/${customer.id}/suspend`).send({});
    const claim = () =>
      request(ctx.app).post('/api/v1/agent/claim').set('Authorization', `Bearer ${agentToken}`);
    expect((await claim()).body.data).toHaveLength(1);
    expect((await claim()).body.data).toHaveLength(0);
    ctx.clock.set('2026-11-02T04:10:00Z');
    expect((await claim()).body.data).toHaveLength(1);
  });
});
