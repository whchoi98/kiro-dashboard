/**
 * Jest transformer for `*.md` imports, mirroring the `asset/source` webpack
 * rule in next.config.js. Without it, `lib/release-notes.ts` — which imports
 * CHANGELOG.md as a build-time string — is untestable, and the module would be
 * verifiable only by deploying.
 */
module.exports = {
  process(sourceText) {
    return { code: `module.exports = ${JSON.stringify(sourceText)};` };
  },
  // Jest caches transform output keyed by this; the file's contents are the
  // only input, so the default content hash is sufficient.
  getCacheKey(sourceText) {
    return require('crypto').createHash('sha1').update(sourceText).digest('hex');
  },
};
