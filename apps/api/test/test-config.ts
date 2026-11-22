export const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgresql://postgres:root@localhost:5432/isp_test?options=-c%20timezone=UTC';
