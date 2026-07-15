// Runs before the test framework loads. Pin a safe, self-contained test
// environment: dev auth, and a DEDICATED test database so specs never touch dev
// data. Override TEST_DATABASE_URL in CI.
import 'reflect-metadata';

process.env.NODE_ENV = 'test';
process.env.AUTH_MODE = 'dev';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://sankofa:sankofa@localhost:5432/sankofa_test?schema=public';
