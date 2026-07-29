/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  modulePaths: ['<rootDir>/infra/node_modules'],
  transform: {
    // Mirrors the `asset/source` rule in next.config.js so `lib/release-notes.ts`
    // (which imports CHANGELOG.md as a string) is testable.
    '\\.md$': '<rootDir>/tests/transform-raw.js',
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
