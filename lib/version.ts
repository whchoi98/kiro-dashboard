import pkg from '../package.json';

// Single source of truth for the app version shown in the UI.
// tests/structure/version-sync.test.ts enforces that CHANGELOG.md and
// CLAUDE.md stay in sync with package.json.
export const APP_VERSION: string = pkg.version;
