/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      diagnostics: false,
      tsconfig: {
        rootDir: '.',
        module: 'commonjs',
        target: 'ES2017',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
      },
    }],
  },
};
