import { execSync } from 'node:child_process';

/**
 * Once per test run: migrate the dedicated test database to the current schema.
 * `prisma migrate deploy` creates the database if it doesn't exist, so a fresh
 * machine (or CI Postgres service) needs no manual setup.
 */
export default function globalSetup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://sankofa:sankofa@localhost:5432/sankofa_test?schema=public';

  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
