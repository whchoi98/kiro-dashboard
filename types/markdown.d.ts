// Markdown files imported as strings. The `asset/source` rule in
// next.config.js makes webpack inline the file's text at build time —
// used by lib/release-notes.ts, which must not read from disk because the
// standalone runtime image ships no markdown.
declare module '*.md' {
  const content: string;
  export default content;
}
