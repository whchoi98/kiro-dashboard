---
description: Release Skill — version upgrade (semver bump, 4-file sync, bilingual changelog, tests) followed by a deploy via the deploy skill. Use for /release, "릴리스", "버전 올려줘".
---

# Release Skill

## Trigger

Use when the user asks to:
- `/release`, "릴리스", "release vX.Y.Z"
- "버전 올려줘", "vX.Y.Z 범프", "버전 업그레이드"
- "체인지로그까지 묶어서 처리"

A release = **version bump + changelog + tests + commit**, then a deploy.
For a deploy without a version change, use the `deploy` skill directly.

## Step 0: Decide the version

Semver against the undeployed/unreleased changes since the last `## [X.Y.Z]`
heading in CHANGELOG.md:
- New menu/page/feature → **minor** (1.11.0 → 1.12.0)
- Fixes/docs/perf only → **patch** (1.11.0 → 1.11.1)

Confirm the number with the user if they didn't state one.

## Step 1: Update the four synced copies

`tests/structure/version-sync.test.ts` enforces all of these — run it and it
tells you exactly what you missed:

1. **`package.json`** — `"version"`. (`lib/version.ts` derives `APP_VERSION`
   from it automatically; never edit lib/version.ts or the Sidebar.)
2. **`CHANGELOG.md`** — insert `## [X.Y.Z] - YYYY-MM-DD` as the newest
   release heading in **BOTH** sections: `# English` (before the `# 한국어`
   line) and `# 한국어` (after it). Move `[Unreleased]` content into it.
   - Both sections must list the same versions in the same order.
   - **EN entries must contain zero Hangul** — `tests/lib/release-notes.test.ts`
     fails on a single Korean character in the English section (write
     "2 AM local time", not "새벽 2시"). KO entries must contain Hangul.
   - Category headings stay in English in both sections (Added/Changed/Fixed).
3. **`CLAUDE.md`** — the `**Version**: X.Y.Z` line. If the release added a
   page, also add it to the Project Structure tree in the same file.
4. **`README.md`** — the badge: `version-X.Y.Z-purple`. (Drifted on two
   consecutive releases before the test pinned it.)

## Step 2: Test gate

```bash
npx jest tests/structure/version-sync.test.ts tests/lib/release-notes.test.ts
npx jest && npm run build     # full suite + type check (npm run lint is BROKEN)
```

`/changelog` renders CHANGELOG.md at **build time** — `.dockerignore` must
keep its `!CHANGELOG.md` exception (guarded by
`tests/structure/changelog-build-input.test.ts`; don't touch it).

## Step 3: Commit

```bash
git add package.json CHANGELOG.md CLAUDE.md README.md
git commit -m "chore(release): vX.Y.Z — <one-line summary of headline features>"
```

Push only when the user says so ("푸시").

## Step 4: Deploy (invoke the deploy skill)

Follow `.claude/skills/deploy/SKILL.md` end to end — it owns the Path A/B
decision, real resource names, verification, and rollback. Release-specific
additions on top of it:

- Tag the ECR image with the **version** as well as `latest` + git sha:

  ```bash
  docker tag kiro-dashboard:latest "$ECR/kiro-dashboard:X.Y.Z"
  docker push "$ECR/kiro-dashboard:X.Y.Z"
  ```

  `latest` alone leaves rollback without a named target — during the
  v1.8.0→v1.9.0 hop, two distinct builds briefly claimed one version and
  only per-commit/per-version tags disambiguated them.

- After verification, confirm the live version: the Sidebar renders
  `v{APP_VERSION}`, so a curl of any page via the ALB + `X-Custom-Secret`
  header should contain `vX.Y.Z`.

## Step 5: Record

Report to the user: version, commit, image digest, ECR tags, verification
results. Update the deploy record (previous digest = rollback anchor).
