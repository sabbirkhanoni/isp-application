import argon2 from 'argon2';
import { createDatabase } from '../src/shared/database/prisma-client.js';

const databaseUrl = process.env['DATABASE_URL'];
const username = (process.env['SEED_ADMIN_USERNAME'] ?? 'admin').toLowerCase();
const password = process.env['SEED_ADMIN_PASSWORD'];
const fullName = process.env['SEED_ADMIN_FULL_NAME'] ?? 'Administrator';

if (!databaseUrl || !password || password.length < 10) {
  console.error('DATABASE_URL and SEED_ADMIN_PASSWORD (min 10 chars) are required.');
  process.exit(1);
}

const db = createDatabase(databaseUrl, 1);
try {
  const existingAdmins = await db.user.count({ where: { role: 'ADMIN' } });
  if (existingAdmins > 0) {
    console.log('An admin already exists; nothing to seed.');
  } else {
    await db.user.create({
      data: {
        username,
        fullName,
        role: 'ADMIN',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        mustChangePassword: true,
      },
    });
    console.log(`Admin "${username}" created. Password change is required on first login.`);
  }
} finally {
  await db.$disconnect();
}
