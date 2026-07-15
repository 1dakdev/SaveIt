/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.spec\\.ts$',
  setupFiles: ['<rootDir>/test/jest.env.ts'],
  globalSetup: '<rootDir>/test/global-setup.ts',
  // Money-path tests share one Postgres and reset between tests, so run serially.
  maxWorkers: 1,
  testTimeout: 30000,
};
