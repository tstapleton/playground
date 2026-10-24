import type { Config } from 'jest';

const config: Config = {
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/src/testing/setup-jest.ts'],
  globalTeardown: '<rootDir>/src/testing/trace/write-index.js',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
};

export default config;
