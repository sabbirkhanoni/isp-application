import argon2 from 'argon2';
import { createDatabase } from '../src/shared/database/prisma-client.js';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const db = createDatabase(databaseUrl, 5);

async function main() {
  console.log('Seeding comprehensive demo data for client presentation...');

  // Clean previous demo transactions for idempotency
  await db.lineStatus.deleteMany().catch(() => {});
  await db.paymentAllocation.deleteMany().catch(() => {});
  await db.bkashTransaction.deleteMany().catch(() => {});
  await db.bkashImportBatch.deleteMany().catch(() => {});
  await db.payment.deleteMany().catch(() => {});
  await db.invoiceLine.deleteMany().catch(() => {});
  await db.invoice.deleteMany().catch(() => {});
  await db.expense.deleteMany().catch(() => {});
  await db.lead.deleteMany().catch(() => {});
  await db.auditLog.deleteMany().catch(() => {});

  // 1. Password hash for test accounts (Admin@12345 and Staff@12345)
  const adminPasswordHash = await argon2.hash('Admin@12345', { type: argon2.argon2id });
  const staffPasswordHash = await argon2.hash('Staff@12345', { type: argon2.argon2id });

  // Update or create Admin
  const admin = await db.user.upsert({
    where: { username: 'admin' },
    update: {
      fullName: 'Engr. Mahbubur Rahman (Admin)',
      passwordHash: adminPasswordHash,
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
      phone: '01711998877',
      role: 'ADMIN',
      status: 'ACTIVE',
      language: 'bn',
    },
    create: {
      username: 'admin',
      fullName: 'Engr. Mahbubur Rahman (Admin)',
      passwordHash: adminPasswordHash,
      mustChangePassword: false,
      phone: '01711998877',
      role: 'ADMIN',
      status: 'ACTIVE',
      language: 'bn',
    },
  });

  // Create Staff users
  const staffKhalid = await db.user.upsert({
    where: { username: 'khalid' },
    update: {
      fullName: 'Khalid Mahmud (Billing Officer)',
      passwordHash: staffPasswordHash,
      mustChangePassword: false,
      phone: '01811223344',
      role: 'STAFF',
      status: 'ACTIVE',
      language: 'bn',
      extraPermissions: [
        'CUSTOMER_CREATE_ACTIVE',
        'CUSTOMER_UPDATE',
        'LEAD_REVIEW',
        'PAYMENT_RECORD_BKASH',
        'BKASH_RECONCILE',
        'FINANCE_REPORT_READ',
      ],
    },
    create: {
      username: 'khalid',
      fullName: 'Khalid Mahmud (Billing Officer)',
      passwordHash: staffPasswordHash,
      mustChangePassword: false,
      phone: '01811223344',
      role: 'STAFF',
      status: 'ACTIVE',
      language: 'bn',
      extraPermissions: [
        'CUSTOMER_CREATE_ACTIVE',
        'CUSTOMER_UPDATE',
        'LEAD_REVIEW',
        'PAYMENT_RECORD_BKASH',
        'BKASH_RECONCILE',
        'FINANCE_REPORT_READ',
      ],
    },
  });

  const staffRakib = await db.user.upsert({
    where: { username: 'rakib' },
    update: {
      fullName: 'Rakib Hasan (Zone Collector)',
      passwordHash: staffPasswordHash,
      mustChangePassword: false,
      phone: '01911334455',
      role: 'STAFF',
      status: 'ACTIVE',
      language: 'bn',
      extraPermissions: ['CUSTOMER_UPDATE'],
    },
    create: {
      username: 'rakib',
      fullName: 'Rakib Hasan (Zone Collector)',
      passwordHash: staffPasswordHash,
      mustChangePassword: false,
      phone: '01911334455',
      role: 'STAFF',
      status: 'ACTIVE',
      language: 'bn',
      extraPermissions: ['CUSTOMER_UPDATE'],
    },
  });

  const staffSumon = await db.user.upsert({
    where: { username: 'sumon' },
    update: {
      fullName: 'Sumon Ahmed (Zone Collector)',
      passwordHash: staffPasswordHash,
      mustChangePassword: false,
      phone: '01611445566',
      role: 'STAFF',
      status: 'ACTIVE',
      language: 'bn',
    },
    create: {
      username: 'sumon',
      fullName: 'Sumon Ahmed (Zone Collector)',
      passwordHash: staffPasswordHash,
      mustChangePassword: false,
      phone: '01611445566',
      role: 'STAFF',
      status: 'ACTIVE',
      language: 'bn',
    },
  });

  console.log('✓ Users seeded (admin, khalid, rakib, sumon)');

  // 2. Packages
  const packagesData = [
    { name: 'Starter - 10 Mbps', speedMbps: 10, monthlyPricePoisha: 50000n, pppProfile: '10M-starter' },
    { name: 'Standard - 20 Mbps', speedMbps: 20, monthlyPricePoisha: 80000n, pppProfile: '20M-standard' },
    { name: 'Super - 35 Mbps', speedMbps: 35, monthlyPricePoisha: 120000n, pppProfile: '35M-super' },
    { name: 'Premium - 50 Mbps', speedMbps: 50, monthlyPricePoisha: 180000n, pppProfile: '50M-premium' },
    { name: 'Corporate - 100 Mbps', speedMbps: 100, monthlyPricePoisha: 350000n, pppProfile: '100M-corp' },
  ];

  const packagesMap = new Map<string, any>();
  for (const pkg of packagesData) {
    const record = await db.package.upsert({
      where: { name: pkg.name },
      update: pkg,
      create: pkg,
    });
    packagesMap.set(pkg.name, record);
  }
  console.log('✓ Packages seeded (5 packages)');

  // 3. Routers
  const routerCore = await db.router.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Mikrotik CCR1036 (Core Gateway)',
      driver: 'REST',
      host: '10.10.0.1',
      port: 443,
      useTls: true,
      allowSelfSigned: true,
      isActive: true,
      lastSeenAt: new Date(),
    },
  });

  const routerZoneA = await db.router.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Mikrotik CCR1009 (Zone A - Kuril & Uttara)',
      driver: 'REST',
      host: '192.168.88.1',
      port: 443,
      useTls: true,
      allowSelfSigned: true,
      isActive: true,
      lastSeenAt: new Date(),
    },
  });

  const routerZoneB = await db.router.upsert({
    where: { id: '00000000-0000-0000-0000-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000003',
      name: 'Mikrotik RB4011 (Zone B - Banani & Gulshan)',
      driver: 'REST',
      host: '192.168.89.1',
      port: 443,
      useTls: true,
      allowSelfSigned: true,
      isActive: true,
      lastSeenAt: new Date(),
    },
  });
  console.log('✓ Routers seeded (3 Mikrotik routers)');

  // 4. OLTs and ONU Signals
  const olt1 = await db.olt.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      name: 'BDCOM-GP3600-08 (Kuril Hub)',
      brand: 'BDCOM',
      host: '10.10.10.1',
      snmpPort: 161,
      communityEnc: 'public',
      isActive: true,
      lastPolledAt: new Date(),
    },
  });

  const olt2 = await db.olt.upsert({
    where: { id: '00000000-0000-0000-0000-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      name: 'VSOL-V1600G (Uttara Sector 3 Hub)',
      brand: 'VSOL',
      host: '10.10.10.2',
      snmpPort: 161,
      communityEnc: 'public',
      isActive: true,
      lastPolledAt: new Date(),
    },
  });

  // ONU Signal readings
  const signalsData = [
    { oltId: olt1.id, onuIndex: '1', onuKey: 'EPON0/1:1', rxDbm: -19.45, alerted: false },
    { oltId: olt1.id, onuIndex: '2', onuKey: 'EPON0/1:2', rxDbm: -21.10, alerted: false },
    { oltId: olt1.id, onuIndex: '3', onuKey: 'EPON0/1:3', rxDbm: -27.80, alerted: true }, // Alert!
    { oltId: olt1.id, onuIndex: '4', onuKey: 'EPON0/2:1', rxDbm: -18.25, alerted: false },
    { oltId: olt1.id, onuIndex: '5', onuKey: 'EPON0/2:2', rxDbm: -20.60, alerted: false },
    { oltId: olt2.id, onuIndex: '1', onuKey: 'GPON0/1:1', rxDbm: -17.90, alerted: false },
    { oltId: olt2.id, onuIndex: '2', onuKey: 'GPON0/1:2', rxDbm: -22.35, alerted: false },
    { oltId: olt2.id, onuIndex: '3', onuKey: 'GPON0/1:3', rxDbm: -28.90, alerted: true }, // Alert!
    { oltId: olt2.id, onuIndex: '4', onuKey: 'GPON0/2:1', rxDbm: -19.80, alerted: false },
  ];

  for (const s of signalsData) {
    await db.onuSignal.upsert({
      where: { oltId_onuIndex: { oltId: s.oltId, onuIndex: s.onuIndex } },
      update: { rxDbm: s.rxDbm, alerted: s.alerted, updatedAt: new Date() },
      create: { ...s, updatedAt: new Date() },
    });
  }
  console.log('✓ OLTs & ONU Signals seeded');

  // 5. Clean up old test customers if needed
  await db.onuSignal.deleteMany({ where: { oltId: { notIn: [olt1.id, olt2.id] } } }).catch(() => {});

  // 6. Customers list with realistic details
  const customersData = [
    {
      code: 'CUST-1001',
      name: 'Tanvir Hossain',
      phone: '01711122233',
      address: 'House 14, Road 2, Block B, Kuril, Dhaka',
      area: 'Kuril',
      pkg: 'Standard - 20 Mbps',
      status: 'ACTIVE',
      collector: staffRakib.id,
      router: routerZoneA.id,
      pppoe: 'tanvir_1001',
      ip: '10.20.1.11',
      mac: 'E4:8D:8C:11:22:01',
      oltName: 'BDCOM-GP3600-08 (Kuril Hub)',
      ponPort: 'EPON0/1:1',
      onuSerial: 'BDCM1001A',
      online: true,
      octPaid: true,
      novStatus: 'PAID',
      novMethod: 'BKASH',
      novTrxId: 'BL89K7X2P1',
      credit: 0n,
    },
    {
      code: 'CUST-1002',
      name: 'Nusrat Jahan',
      phone: '01822233344',
      address: 'Flat 4A, Green Villa, Road 5, Sector 3, Uttara',
      area: 'Uttara Sector 3',
      pkg: 'Super - 35 Mbps',
      status: 'ACTIVE',
      collector: staffRakib.id,
      router: routerZoneA.id,
      pppoe: 'nusrat_1002',
      ip: '10.20.1.12',
      mac: 'E4:8D:8C:11:22:02',
      oltName: 'VSOL-V1600G (Uttara Sector 3 Hub)',
      ponPort: 'GPON0/1:1',
      onuSerial: 'VSOL1002B',
      online: true,
      octPaid: true,
      novStatus: 'PAID',
      novMethod: 'CASH',
      credit: 0n,
    },
    {
      code: 'CUST-1003',
      name: 'Md Rafiqul Islam',
      phone: '01933344455',
      address: 'Holding 88, Kuril Chowrasta, Dhaka',
      area: 'Kuril',
      pkg: 'Standard - 20 Mbps',
      status: 'ACTIVE',
      collector: staffRakib.id,
      router: routerZoneA.id,
      pppoe: 'rafiq_1003',
      ip: '10.20.1.13',
      mac: 'E4:8D:8C:11:22:03',
      oltName: 'BDCOM-GP3600-08 (Kuril Hub)',
      ponPort: 'EPON0/1:2',
      onuSerial: 'BDCM1003C',
      online: true,
      octPaid: true,
      novStatus: 'PARTIALLY_PAID', // 500 paid of 800
      novMethod: 'CASH',
      credit: 0n,
    },
    {
      code: 'CUST-1004',
      name: 'Kamrul Hasan',
      phone: '01644455566',
      address: 'House 5, Road 11, Banani, Dhaka',
      area: 'Banani',
      pkg: 'Premium - 50 Mbps',
      status: 'ACTIVE',
      collector: staffSumon.id,
      router: routerZoneB.id,
      pppoe: 'kamrul_1004',
      ip: '10.20.2.14',
      mac: 'E4:8D:8C:11:22:04',
      oltName: 'BDCOM-GP3600-08 (Kuril Hub)',
      ponPort: 'EPON0/2:1',
      onuSerial: 'BDCM1004D',
      online: true,
      octPaid: true,
      novStatus: 'ISSUED', // Unpaid (Due)
      credit: 0n,
    },
    {
      code: 'CUST-1005',
      name: 'Farhana Akter',
      phone: '01755566677',
      address: 'Flat 6B, Rose Valley, Gulshan 1, Dhaka',
      area: 'Gulshan 1',
      pkg: 'Super - 35 Mbps',
      status: 'ACTIVE',
      collector: staffSumon.id,
      router: routerZoneB.id,
      pppoe: 'farhana_1005',
      ip: '10.20.2.15',
      mac: 'E4:8D:8C:11:22:05',
      oltName: 'BDCOM-GP3600-08 (Kuril Hub)',
      ponPort: 'EPON0/2:2',
      onuSerial: 'BDCM1005E',
      online: true,
      octPaid: true,
      novStatus: 'PAID',
      novMethod: 'BKASH',
      novTrxId: 'BK76M1A9Y4',
      credit: 0n,
    },
    {
      code: 'CUST-1006',
      name: 'Prime Tech Solutions (Corporate)',
      phone: '01866677788',
      address: 'Plot 32, Road 7, Sector 3, Uttara, Dhaka',
      area: 'Uttara Sector 3',
      pkg: 'Corporate - 100 Mbps',
      status: 'ACTIVE',
      collector: staffRakib.id,
      router: routerZoneA.id,
      pppoe: 'primetech_1006',
      ip: '10.20.1.16',
      mac: 'E4:8D:8C:11:22:06',
      oltName: 'VSOL-V1600G (Uttara Sector 3 Hub)',
      ponPort: 'GPON0/1:2',
      onuSerial: 'VSOL1006F',
      online: true,
      octPaid: true,
      novStatus: 'PAID',
      novMethod: 'BKASH',
      novTrxId: 'BL91X8Z4T2',
      credit: 50000n, // 500 tk advance credit
    },
    {
      code: 'CUST-1007',
      name: 'Mahmudul Hasan',
      phone: '01977788899',
      address: 'House 19, Lane 3, Block C, Mirpur 10, Dhaka',
      area: 'Mirpur 10',
      pkg: 'Starter - 10 Mbps',
      status: 'ACTIVE',
      collector: staffSumon.id,
      router: routerZoneB.id,
      pppoe: 'mahmud_1007',
      ip: '10.20.2.17',
      mac: 'E4:8D:8C:11:22:07',
      oltName: 'VSOL-V1600G (Uttara Sector 3 Hub)',
      ponPort: 'GPON0/2:1',
      onuSerial: 'VSOL1007G',
      online: true,
      octPaid: true,
      novStatus: 'PAID',
      novMethod: 'CASH',
      credit: 0n,
    },
    {
      code: 'CUST-1008',
      name: 'Tasnim Ferdous',
      phone: '01588899900',
      address: 'Road 12, Baridhara DOHS, Dhaka',
      area: 'Baridhara DOHS',
      pkg: 'Premium - 50 Mbps',
      status: 'ACTIVE',
      collector: staffRakib.id,
      router: routerZoneA.id,
      pppoe: 'tasnim_1008',
      ip: '10.20.1.18',
      mac: 'E4:8D:8C:11:22:08',
      oltName: 'BDCOM-GP3600-08 (Kuril Hub)',
      ponPort: 'EPON0/1:3', // Bad optical signal!
      onuSerial: 'BDCM1008H',
      online: true,
      octPaid: true,
      novStatus: 'ISSUED', // Due
      credit: 0n,
    },
    {
      code: 'CUST-1009',
      name: 'Shakil Ahmed',
      phone: '01399900011',
      address: 'Holding 45, Badda Link Road, Dhaka',
      area: 'Badda',
      pkg: 'Standard - 20 Mbps',
      status: 'ACTIVE',
      collector: staffSumon.id,
      router: routerZoneB.id,
      pppoe: 'shakil_1009',
      ip: '10.20.2.19',
      mac: 'E4:8D:8C:11:22:09',
      oltName: 'BDCOM-GP3600-08 (Kuril Hub)',
      ponPort: 'EPON0/2:1',
      onuSerial: 'BDCM1009I',
      online: false, // offline line
      octPaid: true,
      novStatus: 'PAID',
      novMethod: 'CASH',
      credit: 0n,
    },
    {
      code: 'CUST-1010',
      name: 'Nasir Uddin',
      phone: '01712001122',
      address: 'Khilkhet Tanpara, Dhaka',
      area: 'Khilkhet',
      pkg: 'Starter - 10 Mbps',
      status: 'ACTIVE',
      collector: staffRakib.id,
      router: routerZoneA.id,
      pppoe: 'nasir_1010',
      ip: '10.20.1.20',
      mac: 'E4:8D:8C:11:22:10',
      oltName: 'BDCOM-GP3600-08 (Kuril Hub)',
      ponPort: 'EPON0/1:1',
      onuSerial: 'BDCM1010J',
      online: true,
      octPaid: true,
      novStatus: 'ISSUED', // Due
      credit: 0n,
    },
    {
      code: 'CUST-1011',
      name: 'Rezaul Karim',
      phone: '01823002233',
      address: 'House 3, Road 18, Sector 3, Uttara',
      area: 'Uttara Sector 3',
      pkg: 'Standard - 20 Mbps',
      status: 'SUSPENDED',
      suspendReason: 'NON_PAYMENT',
      collector: staffRakib.id,
      router: routerZoneA.id,
      pppoe: 'rezaul_1011',
      online: false,
      octPaid: false, // October unpaid too!
      novStatus: 'ISSUED',
      credit: 0n,
    },
    {
      code: 'CUST-1012',
      name: 'Habibur Rahman',
      phone: '01934003344',
      address: 'Road 6, Block D, Kuril, Dhaka',
      area: 'Kuril',
      pkg: 'Starter - 10 Mbps',
      status: 'SUSPENDED',
      suspendReason: 'NON_PAYMENT',
      collector: staffRakib.id,
      router: routerZoneA.id,
      pppoe: 'habib_1012',
      online: false,
      octPaid: false, // October unpaid!
      novStatus: 'ISSUED',
      credit: 0n,
    },
    {
      code: 'CUST-1013',
      name: 'Zahirul Islam',
      phone: '01645004455',
      address: 'Flat 2C, Banani Road 8, Dhaka',
      area: 'Banani',
      pkg: 'Standard - 20 Mbps',
      status: 'PENDING_ACTIVATION',
      collector: staffSumon.id,
      router: routerZoneB.id,
      pppoe: 'zahir_1013',
      online: false,
      octPaid: false,
      novStatus: 'NONE',
      credit: 0n,
    },
    {
      code: 'CUST-1014',
      name: 'Anisur Rahman',
      phone: '01756005566',
      address: 'Uttara Sector 4, Road 1, Dhaka',
      area: 'Uttara Sector 3',
      pkg: 'Super - 35 Mbps',
      status: 'PENDING_ACTIVATION',
      collector: staffRakib.id,
      router: routerZoneA.id,
      pppoe: 'anis_1014',
      online: false,
      octPaid: false,
      novStatus: 'NONE',
      credit: 0n,
    },
    {
      code: 'CUST-1015',
      name: 'Shah Alam',
      phone: '01867006677',
      address: 'Holding 12, Kuril Kazi Bari, Dhaka',
      area: 'Kuril',
      pkg: 'Standard - 20 Mbps',
      status: 'TERMINATED',
      collector: staffRakib.id,
      router: routerZoneA.id,
      pppoe: 'shahalam_1015',
      online: false,
      octPaid: true,
      novStatus: 'NONE',
      credit: 0n,
    },
    {
      code: 'CUST-1016',
      name: 'Mizanur Rahman',
      phone: '01978007788',
      address: 'House 8, Road 4, Sector 3, Uttara',
      area: 'Uttara Sector 3',
      pkg: 'Premium - 50 Mbps',
      status: 'ACTIVE',
      collector: staffRakib.id,
      router: routerZoneA.id,
      pppoe: 'mizan_1016',
      ip: '10.20.1.25',
      mac: 'E4:8D:8C:11:22:16',
      oltName: 'VSOL-V1600G (Uttara Sector 3 Hub)',
      ponPort: 'GPON0/1:3',
      onuSerial: 'VSOL1016P',
      online: true,
      octPaid: true,
      novStatus: 'PAID',
      novMethod: 'BKASH',
      novTrxId: 'BK99Q2W7E5',
      credit: 0n,
    },
  ];

  let receiptCounter = 1000;
  const createdCustomers: any[] = [];

  for (const c of customersData) {
    const pkg = packagesMap.get(c.pkg);
    const existing = await db.customer.findFirst({
      where: { customerCode: { equals: c.code, mode: 'insensitive' } },
    });

    const cust = existing
      ? await db.customer.update({
          where: { id: existing.id },
          data: {
            fullName: c.name,
            phone: c.phone,
            address: c.address,
            area: c.area,
            status: c.status as any,
            suspendReason: (c.suspendReason as any) ?? null,
            suspendedAt: c.status === 'SUSPENDED' ? new Date('2026-11-05T10:00:00Z') : null,
            terminatedAt: c.status === 'TERMINATED' ? new Date('2026-10-31T18:00:00Z') : null,
            joinedOn: new Date('2026-06-01T00:00:00Z'),
            collectorId: c.collector,
            creditPoisha: c.credit,
            createdBy: admin.id,
          },
        })
      : await db.customer.create({
          data: {
            customerCode: c.code,
            fullName: c.name,
            phone: c.phone,
            address: c.address,
            area: c.area,
            status: c.status as any,
            suspendReason: (c.suspendReason as any) ?? null,
            suspendedAt: c.status === 'SUSPENDED' ? new Date('2026-11-05T10:00:00Z') : null,
            terminatedAt: c.status === 'TERMINATED' ? new Date('2026-10-31T18:00:00Z') : null,
            joinedOn: new Date('2026-06-01T00:00:00Z'),
            collectorId: c.collector,
            creditPoisha: c.credit,
            createdBy: admin.id,
          },
        });

    createdCustomers.push({ ...cust, meta: c, pkg });

    // Subscription
    if (pkg) {
      await db.subscription.upsert({
        where: { customerId: cust.id },
        update: {
          packageId: pkg.id,
          connectionType: 'PPPOE',
          pppoeUsername: c.pppoe,
          routerId: c.router,
          oltName: c.oltName,
          ponPort: c.ponPort,
          onuSerial: c.onuSerial,
          activationPolicy: 'ACTIVATE_NOW',
        },
        create: {
          customerId: cust.id,
          packageId: pkg.id,
          connectionType: 'PPPOE',
          pppoeUsername: c.pppoe,
          routerId: c.router,
          oltName: c.oltName,
          ponPort: c.ponPort,
          onuSerial: c.onuSerial,
          activationPolicy: 'ACTIVATE_NOW',
        },
      });
    }

    // Line Status (Only provisioned lines for ACTIVE and SUSPENDED customers)
    if (c.router && c.pppoe && c.status !== 'PENDING_ACTIVATION' && c.status !== 'TERMINATED') {
      await db.lineStatus.upsert({
        where: { routerId_pppoeUsername: { routerId: c.router, pppoeUsername: c.pppoe } },
        update: {
          online: c.online,
          address: c.ip ?? null,
          callerId: c.mac ?? null,
          sessionStartedAt: c.online ? new Date('2026-11-16T08:00:00Z') : null,
          lastOnlineAt: new Date(),
          rxBytes: c.online ? BigInt(Math.floor(Math.random() * 40 + 10) * 1024 * 1024 * 1024) : 0n,
          txBytes: c.online ? BigInt(Math.floor(Math.random() * 8 + 2) * 1024 * 1024 * 1024) : 0n,
          updatedAt: new Date(),
        },
        create: {
          routerId: c.router,
          pppoeUsername: c.pppoe,
          online: c.online,
          address: c.ip ?? null,
          callerId: c.mac ?? null,
          sessionStartedAt: c.online ? new Date('2026-11-16T08:00:00Z') : null,
          lastOnlineAt: new Date(),
          rxBytes: c.online ? BigInt(Math.floor(Math.random() * 40 + 10) * 1024 * 1024 * 1024) : 0n,
          txBytes: c.online ? BigInt(Math.floor(Math.random() * 8 + 2) * 1024 * 1024 * 1024) : 0n,
          updatedAt: new Date(),
        },
      });

      // Daily Usage for past 7 days (Nov 12 - Nov 18)
      if (c.online) {
        for (let d = 12; d <= 18; d++) {
          const dayDate = new Date(Date.UTC(2026, 10, d)); // Nov is month 10
          const down = BigInt(Math.floor(Math.random() * 10 + 3) * 1024 * 1024 * 1024);
          const up = BigInt(Math.floor(Math.random() * 2 + 1) * 1024 * 1024 * 1024);
          await db.usageDaily.upsert({
            where: {
              routerId_pppoeUsername_day: {
                routerId: c.router,
                pppoeUsername: c.pppoe,
                day: dayDate,
              },
            },
            update: { downloadBytes: down, uploadBytes: up },
            create: {
              routerId: c.router,
              pppoeUsername: c.pppoe,
              day: dayDate,
              downloadBytes: down,
              uploadBytes: up,
            },
          });
        }
      }
    }

    // Invoices and Payments: October 2026
    const octPeriod = new Date('2026-10-01T00:00:00Z');
    const octDue = new Date('2026-10-10T00:00:00Z');
    const octInvNumber = `INV-2026-10-${c.code}`;

    if (c.status !== 'PENDING_ACTIVATION') {
      const octAmount = pkg.monthlyPricePoisha;
      const isOctPaid = c.octPaid;

      const octInv = await db.invoice.upsert({
        where: { customerId_period: { customerId: cust.id, period: octPeriod } },
        update: {
          amountPoisha: octAmount,
          paidPoisha: isOctPaid ? octAmount : 0n,
          status: isOctPaid ? 'PAID' : 'ISSUED',
        },
        create: {
          invoiceNumber: octInvNumber,
          customerId: cust.id,
          period: octPeriod,
          amountPoisha: octAmount,
          paidPoisha: isOctPaid ? octAmount : 0n,
          dueDate: octDue,
          status: isOctPaid ? 'PAID' : 'ISSUED',
          issuedAt: new Date('2026-10-01T06:00:00Z'),
        },
      });

      // Invoice line for October
      const existingLine = await db.invoiceLine.findFirst({ where: { invoiceId: octInv.id } });
      if (!existingLine) {
        await db.invoiceLine.create({
          data: {
            invoiceId: octInv.id,
            kind: 'PACKAGE',
            description: `Monthly Internet Fee: ${pkg.name}`,
            amountPoisha: octAmount,
          },
        });
      }

      if (isOctPaid) {
        const octPaymentRec = `R${String(++receiptCounter).padStart(6, '0')}`;
        const existingPmt = await db.payment.findUnique({ where: { receiptNumber: octPaymentRec } });
        if (!existingPmt) {
          const pmt = await db.payment.create({
            data: {
              receiptNumber: octPaymentRec,
              customerId: cust.id,
              amountPoisha: octAmount,
              method: 'CASH',
              status: 'POSTED',
              receivedBy: c.collector ?? admin.id,
              receivedAt: new Date('2026-10-06T11:30:00Z'),
            },
          });
          await db.paymentAllocation.create({
            data: {
              paymentId: pmt.id,
              invoiceId: octInv.id,
              amountPoisha: octAmount,
            },
          });
        }
      }
    }

    // Invoices and Payments: November 2026 (Current Month)
    if (c.novStatus !== 'NONE') {
      const novPeriod = new Date('2026-11-01T00:00:00Z');
      const novDue = new Date('2026-11-10T00:00:00Z');
      const novInvNumber = `INV-2026-11-${c.code}`;
      const novAmount = pkg.monthlyPricePoisha;

      let novPaidPoisha = 0n;
      let novInvoiceStatus: any = 'ISSUED';
      if (c.novStatus === 'PAID') {
        novPaidPoisha = novAmount;
        novInvoiceStatus = 'PAID';
      } else if (c.novStatus === 'PARTIALLY_PAID') {
        novPaidPoisha = 50000n; // 500 Tk paid
        novInvoiceStatus = 'PARTIALLY_PAID';
      }

      const novInv = await db.invoice.upsert({
        where: { customerId_period: { customerId: cust.id, period: novPeriod } },
        update: {
          amountPoisha: novAmount,
          paidPoisha: novPaidPoisha,
          status: novInvoiceStatus,
        },
        create: {
          invoiceNumber: novInvNumber,
          customerId: cust.id,
          period: novPeriod,
          amountPoisha: novAmount,
          paidPoisha: novPaidPoisha,
          dueDate: novDue,
          status: novInvoiceStatus,
          issuedAt: new Date('2026-11-01T06:00:00Z'),
        },
      });

      const existingNovLine = await db.invoiceLine.findFirst({ where: { invoiceId: novInv.id } });
      if (!existingNovLine) {
        await db.invoiceLine.create({
          data: {
            invoiceId: novInv.id,
            kind: 'PACKAGE',
            description: `Monthly Internet Fee: ${pkg.name}`,
            amountPoisha: novAmount,
          },
        });
      }

      // Record November payment if paid or partially paid
      if (novPaidPoisha > 0n) {
        const novPaymentRec = `R${String(++receiptCounter).padStart(6, '0')}`;
        const payDay = Math.floor(Math.random() * 10 + 2); // 2nd to 12th Nov
        const payDate = new Date(Date.UTC(2026, 10, payDay, 10 + (payDay % 5), 15));

        const pmt = await db.payment.create({
          data: {
            receiptNumber: novPaymentRec,
            customerId: cust.id,
            amountPoisha: novPaidPoisha,
            method: (c.novMethod as any) ?? 'CASH',
            bkashTrxId: c.novTrxId ?? null,
            status: 'POSTED',
            receivedBy: c.novMethod === 'BKASH' ? admin.id : (c.collector ?? staffRakib.id),
            receivedAt: payDate,
            note: c.novMethod === 'BKASH' ? `bKash payment TrxID: ${c.novTrxId}` : 'Collected in cash',
          },
        });

        await db.paymentAllocation.create({
          data: {
            paymentId: pmt.id,
            invoiceId: novInv.id,
            amountPoisha: novPaidPoisha,
          },
        });
      }
    }
  }

  console.log(`✓ Customers seeded (16 customers, subscriptions, line statuses, usage, invoices, payments)`);

  // 7. bKash Import Batch and Reconciliation Data
  const bkashBatch = await db.bkashImportBatch.create({
    data: {
      fileName: 'bkash_statement_nov_2026.csv',
      uploadedBy: admin.id,
      totalRows: 5,
      postedCount: 3,
      verifiedCount: 2,
      reviewCount: 2,
      duplicateCount: 0,
      invalidCount: 0,
      createdAt: new Date('2026-11-15T10:00:00Z'),
    },
  });

  // bKash Transactions
  await db.bkashTransaction.createMany({
    data: [
      {
        trxId: 'BL89K7X2P1',
        amountPoisha: 80000n, // 800 Tk
        senderPhone: '01711122233',
        reference: 'CUST-1001',
        occurredAt: new Date('2026-11-04T11:20:00Z'),
        status: 'VERIFIED',
        batchId: bkashBatch.id,
        customerId: createdCustomers[0]?.id,
      },
      {
        trxId: 'BK76M1A9Y4',
        amountPoisha: 120000n, // 1200 Tk
        senderPhone: '01755566677',
        reference: 'CUST-1005',
        occurredAt: new Date('2026-11-07T14:45:00Z'),
        status: 'VERIFIED',
        batchId: bkashBatch.id,
        customerId: createdCustomers[4]?.id,
      },
      {
        trxId: 'BL91X8Z4T2',
        amountPoisha: 350000n, // 3500 Tk
        senderPhone: '01866677788',
        reference: 'CUST-1006',
        occurredAt: new Date('2026-11-09T09:15:00Z'),
        status: 'POSTED',
        batchId: bkashBatch.id,
        customerId: createdCustomers[5]?.id,
      },
      {
        trxId: 'BL33M8K1Q9',
        amountPoisha: 80000n,
        senderPhone: '01933344455',
        reference: 'INTERNET',
        occurredAt: new Date('2026-11-14T16:30:00Z'),
        status: 'NEEDS_REVIEW',
        reviewReason: 'PHONE_SUGGESTION',
        suggestedCustomerId: createdCustomers[2]?.id,
        batchId: bkashBatch.id,
      },
      {
        trxId: 'BL55P2L9V3',
        amountPoisha: 100000n,
        senderPhone: '01899988877',
        reference: 'UNKNOWN-REF',
        occurredAt: new Date('2026-11-15T18:00:00Z'),
        status: 'NEEDS_REVIEW',
        reviewReason: 'NO_REFERENCE_MATCH',
        batchId: bkashBatch.id,
      },
    ],
    skipDuplicates: true,
  });
  console.log('✓ bKash transactions & reconciliation batch seeded');

  // 8. Expenses
  await db.expense.createMany({
    data: [
      {
        spentOn: new Date('2026-11-02T00:00:00Z'),
        category: 'BANDWIDTH',
        amountPoisha: 4500000n, // 45,000 Tk
        payee: 'Summit Communications Ltd',
        note: 'Primary 1 Gbps IP Transit & Peering port charge',
        createdBy: admin.id,
      },
      {
        spentOn: new Date('2026-11-05T00:00:00Z'),
        category: 'RENT',
        amountPoisha: 1500000n, // 15,000 Tk
        payee: 'Al-Haj Abdul Matin (Landlord)',
        note: 'Central Server Room & Support Office rent for Nov 2026',
        createdBy: admin.id,
      },
      {
        spentOn: new Date('2026-11-07T00:00:00Z'),
        category: 'SALARY',
        amountPoisha: 3500000n, // 35,000 Tk
        payee: 'Technical & Field Support Staff',
        note: 'Salaries for field technicians and support team',
        createdBy: admin.id,
      },
      {
        spentOn: new Date('2026-11-10T00:00:00Z'),
        category: 'EQUIPMENT',
        amountPoisha: 650000n, // 6,500 Tk
        payee: 'Optical Tech BD',
        note: 'Purchase 2 core fiber drum, 8-way splitters, splice trays',
        createdBy: admin.id,
      },
      {
        spentOn: new Date('2026-11-12T00:00:00Z'),
        category: 'ELECTRICITY',
        amountPoisha: 480000n, // 4,800 Tk
        payee: 'DESCO & Local Fuel Station',
        note: 'Electricity bill & Octane for backup generator',
        createdBy: admin.id,
      },
      {
        spentOn: new Date('2026-11-15T00:00:00Z'),
        category: 'OTHER',
        amountPoisha: 160000n, // 1,600 Tk
        payee: 'General Store',
        note: 'Tea, snacks, water jars for office and staff',
        createdBy: admin.id,
      },
    ],
    skipDuplicates: true,
  });
  console.log('✓ Expenses seeded (Bandwidth, Rent, Salaries, Hardware, Utility)');

  // 9. Collection Targets for Staff
  const currentPeriodDate = new Date('2026-11-01T00:00:00Z');
  await db.collectionTarget.upsert({
    where: { userId_period: { userId: staffRakib.id, period: currentPeriodDate } },
    update: { targetPoisha: 6000000n }, // 60,000 Tk target
    create: { userId: staffRakib.id, period: currentPeriodDate, targetPoisha: 6000000n },
  });

  await db.collectionTarget.upsert({
    where: { userId_period: { userId: staffSumon.id, period: currentPeriodDate } },
    update: { targetPoisha: 4500000n }, // 45,000 Tk target
    create: { userId: staffSumon.id, period: currentPeriodDate, targetPoisha: 4500000n },
  });
  console.log('✓ Collection targets seeded for field staff');

  // 10. Leads
  await db.lead.createMany({
    data: [
      {
        fullName: 'Mahir Faysal',
        phone: '01712990011',
        address: 'House 22, Road 4, Sector 3, Uttara',
        area: 'Uttara Sector 3',
        requestedPackageId: packagesMap.get('Super - 35 Mbps')?.id,
        connectionType: 'PPPOE',
        note: 'Needs new optical fiber line with Wi-Fi ONU router',
        status: 'PENDING',
        createdBy: staffRakib.id,
      },
      {
        fullName: 'Dr. Selim Reza',
        phone: '01823881122',
        address: 'Flat 5B, Concord Lake City, Khilkhet',
        area: 'Khilkhet',
        requestedPackageId: packagesMap.get('Premium - 50 Mbps')?.id,
        connectionType: 'PPPOE',
        note: 'Work-from-home physician, requires low latency connection',
        status: 'PENDING',
        createdBy: staffRakib.id,
      },
      {
        fullName: 'Kamal Hossain',
        phone: '01934772233',
        address: 'Kuril Bishwa Road, Overbridge east side',
        area: 'Kuril',
        requestedPackageId: packagesMap.get('Standard - 20 Mbps')?.id,
        connectionType: 'PPPOE',
        note: 'Switching from another ISP due to frequent downtime',
        status: 'APPROVED',
        createdBy: staffRakib.id,
        reviewedBy: admin.id,
        reviewedAt: new Date('2026-11-17T15:00:00Z'),
      },
      {
        fullName: 'Anwar Fabrics Store',
        phone: '01645663344',
        address: 'Plot 88, Badda DIT Road',
        area: 'Badda',
        requestedPackageId: packagesMap.get('Corporate - 100 Mbps')?.id,
        connectionType: 'STATIC',
        note: 'Commercial connection with static public IP',
        status: 'REJECTED',
        rejectReason: 'Currently out of direct optical distribution box reach',
        createdBy: staffSumon.id,
        reviewedBy: admin.id,
        reviewedAt: new Date('2026-11-16T12:00:00Z'),
      },
    ],
    skipDuplicates: true,
  });
  console.log('✓ Leads seeded (4 realistic leads)');

  // 11. Audit Logs
  await db.auditLog.createMany({
    data: [
      {
        actorUserId: admin.id,
        action: 'USER_LOGIN',
        outcome: 'SUCCESS',
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-11-18T10:00:00Z'),
      },
      {
        actorUserId: staffRakib.id,
        action: 'PAYMENT_RECORD_CASH',
        targetType: 'Payment',
        targetId: 'REC-1002',
        outcome: 'SUCCESS',
        ipAddress: '10.20.1.5',
        createdAt: new Date('2026-11-18T11:15:00Z'),
      },
      {
        actorUserId: admin.id,
        action: 'BKASH_STATEMENT_IMPORT',
        targetType: 'BkashBatch',
        targetId: bkashBatch.id,
        outcome: 'SUCCESS',
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-11-18T12:30:00Z'),
      },
      {
        actorUserId: staffKhalid.id,
        action: 'CUSTOMER_UPDATE',
        targetType: 'Customer',
        targetId: createdCustomers[0]?.id,
        outcome: 'SUCCESS',
        ipAddress: '127.0.0.1',
        createdAt: new Date('2026-11-18T14:00:00Z'),
      },
    ],
  });
  console.log('✓ Audit logs seeded');

  console.log('\n======================================================');
  console.log('DEMO DATA SEEDING COMPLETE!');
  console.log('======================================================');
  console.log('Login credentials for demo:');
  console.log('1. Super Admin:');
  console.log('   Username: admin');
  console.log('   Password: Admin@12345');
  console.log('2. Billing Staff:');
  console.log('   Username: khalid');
  console.log('   Password: Staff@12345');
  console.log('3. Field Collector:');
  console.log('   Username: rakib');
  console.log('   Password: Staff@12345');
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error('Error seeding demo data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
