import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { effectiveProfile, normalizeOnuKey, toDbm } from '../src/modules/olt/olt-profiles.js';
import { ADMIN, STAFF, createTestContext, loginAs, resetDatabase, seedUsers } from './helpers.js';

describe('OLT value parsing', () => {
  it('turns raw readings into dBm', () => {
    expect(toDbm(-182, 10)).toBe(-18.2); // BDCOM 0.1 dB
    expect(toDbm(-2750, 100)).toBe(-27.5); // Huawei 0.01 dBm
    expect(toDbm(Buffer.from('-18.52'), 1)).toBe(-18.52); // text with a decimal point
    expect(toDbm(2147483647, 100)).toBeNull(); // "no reading" marker
    expect(toDbm(Buffer.from('N/A'), 1)).toBeNull();
  });

  it('normalises MACs and serials so they match what staff type', () => {
    const mac = Buffer.from([0xaa, 0xbb, 0xcc, 0x00, 0x11, 0x22]);
    expect(normalizeOnuKey(mac)).toBe('AABBCC001122');
    expect(normalizeOnuKey(Buffer.from('aa:bb:cc:00:11:22'))).toBe('AABBCC001122');
    const huawei = Buffer.concat([Buffer.from('HWTC'), Buffer.from([0x1a, 0x2b, 0x3c, 0x4d])]);
    expect(normalizeOnuKey(huawei)).toBe('HWTC1A2B3C4D');
  });

  it('lets an OLT override the brand preset; C-Data has none', () => {
    expect(effectiveProfile('CDATA', { rxOid: null, idOid: null, divisor: null })).toBeNull();
    expect(effectiveProfile('CDATA', { rxOid: '.1.2.3.4', idOid: null, divisor: 100 })).toEqual({
      rxOid: '1.2.3.4',
      idOid: null,
      divisor: 100,
    });
  });
});

const ctx = createTestContext({ OWNER_PHONE: '01700000000' });
afterAll(() => ctx.close());

const RX = '1.3.6.1.4.1.3320.101.10.5.1.5';
const ID = '1.3.6.1.4.1.3320.101.10.1.1.3';
const mac = (last: number) => Buffer.from([0xaa, 0xbb, 0xcc, 0x00, 0x11, last]);

function setSignals(values: Record<string, number>) {
  ctx.snmp.tables[RX] = Object.entries(values).map(([i, v]) => ({ oid: `${RX}.${i}`, value: v }));
  ctx.snmp.tables[ID] = [
    { oid: `${ID}.1`, value: mac(1) },
    { oid: `${ID}.2`, value: mac(2) },
    { oid: `${ID}.3`, value: mac(3) },
  ];
}

let admin: Awaited<ReturnType<typeof loginAs>>;
let staff: Awaited<ReturnType<typeof loginAs>>;
let oltId: string;

beforeEach(async () => {
  await resetDatabase(ctx.db);
  await seedUsers(ctx.db);
  ctx.sms.sent.length = 0;
  ctx.snmp.failWith = null;
  admin = await loginAs(ctx.app, ADMIN);
  staff = await loginAs(ctx.app, STAFF);
  const pkg = await ctx.db.package.create({
    data: { name: 'Home 10', speedMbps: 10, monthlyPricePoisha: 50000n },
  });
  const made = await admin.post('/api/v1/customers').send({
    fullName: 'Karim Mia',
    phone: '01711223344',
    address: 'House 5',
    packageId: pkg.id,
    connectionType: 'PPPOE',
    activationPolicy: 'ACTIVATE_NOW',
    pppoeUsername: 'karim',
    onuSerial: 'aabb.cc00.1102',
  });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const created = await admin.post('/api/v1/olts').send({
    name: 'OLT-Main',
    brand: 'BDCOM',
    host: '10.0.0.9',
    community: 'public',
  });
  oltId = created.body.data.id;
});

describe('OLT setup', () => {
  it('is admin only and C-Data needs its own OID', async () => {
    expect((await staff.get('/api/v1/olts')).status).toBe(403);
    const cdata = await admin
      .post('/api/v1/olts')
      .send({ name: 'CD', brand: 'CDATA', host: '10.0.0.10', community: 'public' });
    expect(cdata.status).toBe(400);
    const ok = await admin.post('/api/v1/olts').send({
      name: 'CD',
      brand: 'CDATA',
      host: '10.0.0.10',
      community: 'public',
      rxOid: '1.3.6.1.4.1.17409.2.3.4.2.1.4',
    });
    expect(ok.status).toBe(201);
  });

  it('never returns the community and rejects duplicate names', async () => {
    const list = await admin.get('/api/v1/olts');
    expect(JSON.stringify(list.body)).not.toContain('public');
    const dup = await admin
      .post('/api/v1/olts')
      .send({ name: 'olt-main', brand: 'BDCOM', host: '10.0.0.8', community: 'x' });
    expect(dup.status).toBe(409);
  });

  it('test shows raw samples and explains an unreachable OLT', async () => {
    setSignals({ '1': -182, '2': -271, '3': -231 });
    const res = await admin.post(`/api/v1/olts/${oltId}/test`);
    expect(res.body.data.ok).toBe(true);
    expect(res.body.data.samples[0]).toMatchObject({ raw: '-182', rxDbm: -18.2 });
    ctx.snmp.failWith = new Error('Request timed out');
    const down = await admin.post(`/api/v1/olts/${oltId}/test`);
    expect(down.body.data.ok).toBe(false);
    expect(down.body.data.message).toMatch(/did not answer/);
  });
});

describe('fiber signals and alerts', () => {
  it('stores readings, matches customers by ONU serial and ranks worst first', async () => {
    setSignals({ '1': -182, '2': -291, '3': -261 });
    await admin.post(`/api/v1/olts/${oltId}/poll`);
    const res = await staff.get('/api/v1/fiber');
    expect(res.status).toBe(200);
    expect(res.body.meta.summary).toEqual({ total: 3, good: 1, weak: 1, critical: 1 });
    const worst = res.body.data[0];
    expect(worst).toMatchObject({ rxDbm: -29.1, level: 'CRITICAL', onuKey: 'AABBCC001102' });
    expect(worst.customerName).toBe('Karim Mia');
    const crit = await staff.get('/api/v1/fiber?filter=CRITICAL');
    expect(crit.body.data).toHaveLength(1);
    const loose = await staff.get('/api/v1/fiber?filter=UNMATCHED');
    expect(loose.body.data).toHaveLength(2);
  });

  it('shows one customer their own signal', async () => {
    setSignals({ '1': -182, '2': -291, '3': -261 });
    await admin.post(`/api/v1/olts/${oltId}/poll`);
    const customer = await ctx.db.customer.findFirstOrThrow();
    const res = await staff.get(`/api/v1/fiber/customer/${customer.id}`);
    expect(res.body.data).toMatchObject({ rxDbm: -29.1, level: 'CRITICAL', oltName: 'OLT-Main' });
  });

  it('texts the owner once per fault, and again only after recovery', async () => {
    setSignals({ '1': -182, '2': -291, '3': -261 });
    await admin.post(`/api/v1/olts/${oltId}/poll`);
    expect(ctx.sms.sent).toHaveLength(1);
    expect(ctx.sms.sent[0]?.message).toContain('Karim Mia');
    expect(ctx.sms.sent[0]?.message).toContain('-29.1');

    await admin.post(`/api/v1/olts/${oltId}/poll`); // still bad: no new SMS
    expect(ctx.sms.sent).toHaveLength(1);

    setSignals({ '1': -182, '2': -201, '3': -261 }); // fixed
    await admin.post(`/api/v1/olts/${oltId}/poll`);
    setSignals({ '1': -182, '2': -295, '3': -261 }); // broke again
    await admin.post(`/api/v1/olts/${oltId}/poll`);
    expect(ctx.sms.sent).toHaveLength(2);
  });

  it('keeps the last error when an OLT cannot be read', async () => {
    ctx.snmp.failWith = new Error('Request timed out');
    await ctx.olt.pollAll();
    const list = await admin.get('/api/v1/olts');
    expect(list.body.data[0].lastError).toMatch(/did not answer/);
  });
});
