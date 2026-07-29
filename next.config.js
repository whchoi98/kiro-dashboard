/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack: (config) => {
    // Inline CHANGELOG.md into the bundle as a string at build time.
    //
    // lib/release-notes.ts is imported by the Sidebar, which app/layout.tsx
    // renders on EVERY request — so it must not touch the filesystem.
    // `output: 'standalone'` ships only public/ and .next/, so a runtime
    // readFileSync would throw and take down every page. (The /changelog page
    // gets away with a read solely because force-static runs it at build time.)
    //
    // The file still has to survive the Docker build context, so the
    // `!CHANGELOG.md` re-include in .dockerignore remains load-bearing.
    config.module.rules.push({
      test: /CHANGELOG\.md$/,
      type: 'asset/source',
    });
    return config;
  },
};

module.exports = nextConfig;
