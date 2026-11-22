import supertest from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

const ctx = createTestContext();
afterAll(() => ctx.close());

let packageId: string;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.clock.set('2026-11-13T04:00:00Z');
  packageId = (
    await ctx.db.package.create({
      data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
    })
  ).id;
});

async function addCustomer(name: string, phone: string, customerCode?: string) {
  const admin = await loginAs(ctx.app, ADMIN);
  const res = await admin.post('/api/v1/customers').send({
    fullName: name,
    phone,
    address: 'House 5, Road 2',
    packageId,
    connectionType: 'DHCP',
    activationPolicy: 'ACTIVATE_NOW',
    ...(customerCode ? { customerCode } : {}),
  });
  return res.body.data as { id: string };
}

const sms = (trx: string, amount: string, from: string, extra = '') =>
  `You have received payment Tk ${amount} from ${from}. Fee Tk 0.00. ${extra} TrxID ${trx} at 13/11/2026 10:30`;

async function enable() {
  const admin = await loginAs(ctx.app, ADMIN);
  const res = await admin.post('/api/v1/bkash/hook/enable');
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}
const hook = (token: string, message: string) =>
  supertest(ctx.app)
    .post('/api/v1/hooks/bkash-sms')
    .set('Authorization', `Bearer ${token}`)
    .send({ message });

describe('bKash SMS forwarding', () => {
  it('is closed until an admin enables it, and staff cannot manage it', async () => {
    const res = await hook('whatever', sms('AAAA111111', '500', '01711223344'));
    expect(res.status).toBe(401);
    const staff = await loginAs(ctx.app, STAFF);
    expect((await staff.post('/api/v1/bkash/hook/enable')).status).toBe(403);
  });

  it('credits a customer by sender phone, once, however many times the SMS is retried', async () => {
    const c = await addCustomer('Karim Mia', '01711223344');
    await ctx.billing.generateForPeriod();
    const token = await enable();

    const first = await hook(token, sms('AAAA111111', '500.00', '01711223344'));
    expect(first.status).toBe(200);
    expect(first.body.data.result).toBe('posted');
    const again = await hook(token, sms('AAAA111111', '500.00', '01711223344'));
    expect(again.body.data.result).toBe('duplicate');

    const payments = await ctx.db.payment.findMany({ where: { customerId: c.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]?.amountPoisha).toBe(50000n);
    const status = await (await loginAs(ctx.app, ADMIN)).get('/api/v1/bkash/hook');
    expect(status.body.data.lastReceivedAt).not.toBeNull();
  });

  it('queues unknown senders for review and ignores non-payment SMS', async () => {
    const token = await enable();
    const unknown = await hook(token, sms('BBBB222222', '300', '01999000111'));
    expect(unknown.body.data.result).toBe('review');
    const otp = await hook(token, 'Your bKash verification code is 123456');
    expect(otp.body.data.result).toBe('ignored');
    expect(await ctx.db.bkashTransaction.count({ where: { status: 'NEEDS_REVIEW' } })).toBe(1);
  });

  it('only suggests (no credit) when phone auto-match is turned off', async () => {
    await addCustomer('Karim Mia', '01711223344');
    const token = await enable();
    const admin = await loginAs(ctx.app, ADMIN);
    await admin.put('/api/v1/bkash/hook/auto-match').send({ autoMatchByPhone: false });
    const res = await hook(token, sms('CCCC333333', '500', '01711223344'));
    expect(res.body.data.result).toBe('review');
  });

  it('stops working after disable, and a new token replaces the old one', async () => {
    const t1 = await enable();
    const t2 = await enable();
    expect((await hook(t1, sms('DDDD444444', '100', '01999000111'))).status).toBe(401);
    expect((await hook(t2, sms('DDDD444444', '100', '01999000111'))).status).toBe(200);
    const admin = await loginAs(ctx.app, ADMIN);
    await admin.post('/api/v1/bkash/hook/disable');
    expect((await hook(t2, sms('EEEE555555', '100', '01999000111'))).status).toBe(401);
  });
});
