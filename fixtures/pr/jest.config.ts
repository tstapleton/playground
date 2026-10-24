import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/src/testing/setup-jest.ts'],
  globalTeardown: 'signal-trace/jest/global-teardown',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
};

export default config;
