# `.kiro/` — Kiro CLI configuration for kiro-dashboard

Everything Kiro CLI reads for this workspace. Open a `kiro-cli chat` session in
the repository root and it loads automatically.

```
.kiro/
├── AGENTS.md        this file — map of the configuration
├── agents/          agent definitions (JSON)      → /agent, ctrl+shift+<key>
├── hooks/           lifecycle scripts (bash)      → wired from agents[].hooks
│   └── lib/         shared STDIN event parser
├── prompts/         file prompts (Markdown)       → /test-all, /review-diff, @name
├── settings/        workspace CLI settings        → cli.json
├── skills/          on-demand skills (SKILL.md)   → /<skill-name>
└── steering/        always-loaded project rules   → every turn, keep terse
```

The project brief itself (stack, data source, directory map, conventions) lives
in the **root** `AGENTS.md`, which Kiro loads as the project marker file. This
file documents the tooling around it.

## Agents

| Agent | Shortcut | Writes files? | Purpose |
|-------|----------|---------------|---------|
| `kiro-dashboard-dev` | `ctrl+shift+d` | yes | default agent — frontend, API routes, Athena, CDK |
| `code-reviewer` | `ctrl+shift+r` | no | reviews a diff; `shell` allowlisted to git/tsc/jest via `denyByDefault` |
| `security-auditor` | `ctrl+shift+s` | no | IAM, secrets, masking, infra posture |

`chat.defaultAgent` in `settings/cli.json` selects `kiro-dashboard-dev`.
Validate any edit with `kiro-cli agent validate --path .kiro/agents/<name>.json`
(it exits 0 either way — empty STDERR is the success signal).

Guardrails live in `toolsSettings`, ported from `.claude/settings.json`'s
`permissions.deny`:

- `write.deniedPaths` — `.env*`, `node_modules/**`, `.next/**`, `cdk.out/**`, `.git/**`
- `shell.deniedCommands` — `rm -rf /`, `git push --force`, `git reset --hard`,
  `git checkout -- …`, `git clean -f`, `> .env*`, `sudo`, `npx cdk destroy`
- `use_aws.allowedServices` + `autoAllowReadonly` — read-only AWS calls run unprompted

`deniedCommands` entries are denied outright, with no approval prompt. A
deliberate, user-approved revert therefore has to use a command outside that
list (`git restore …`) or be run by the user in a shell.

## Hooks

Kiro delivers the hook event as **JSON on STDIN** (`hook_event_name`, `cwd`,
`tool_name`, `tool_input`, `tool_response`, `assistant_response`). There are no
`CLAUDE_TOOL_*` environment variables. `hooks/lib/event.sh` +
`hooks/lib/parse-event.js` flatten the payload into `HOOK_*` shell variables via
base64 (safe for multi-line content); hooks fail open when the payload is missing
or unparseable.

| Script | Trigger | Matcher | Effect |
|--------|---------|---------|--------|
| `session-context.sh` | `agentSpawn` | — | STDOUT joins the context: version, git state, conventions, test gate |
| `secret-scan.sh` | `preToolUse` | `write` | **exit 2 blocks the write**; findings go to STDERR and back to the model |
| `check-doc-sync.sh` | `postToolUse` | `write` | advisory: new route/component/lib not yet in its module doc |
| `notify.sh` | `stop` | — | POSTs a turn summary when `NOTIFY_WEBHOOK_URL` is set; otherwise a no-op |

Exit-code contract: `0` allow, `2` block (preToolUse only), anything else is a
warning shown to the user. Behavior is pinned by
`tests/hooks/test-kiro-hooks.sh`.

## Skills vs prompts

Both surface as slash commands; **file prompts win a name collision**, so the two
sets use different names. Workspace skills carry a `-guide` suffix where a
generic global skill of the same name exists in `~/.kiro/skills/`
(`code-review`, `refactor`, `release`, `sync-docs`) — without it, which one
`/code-review` resolves to is ambiguous.

| Skill | Use for |
|-------|---------|
| `/athena-query-helper` | Athena SQL, both report schemas, when to read S3 directly |
| `/cdk-deploy-guide` | deploy: Path A (image) vs Path B (CDK), stacks, verification, rollback |
| `/dashboard-component-guide` | pages, charts, i18n, theme conventions |
| `/code-review-guide` | review checklist + finding schema |
| `/refactor-guide` | safe restructuring with the verification gate |
| `/release-guide` | version bump, four synced copies, bilingual changelog, deploy |
| `/sync-docs-guide` | reconcile docs with the source tree |

| Prompt | Use for |
|--------|---------|
| `/test-all` | run the gate: jest, tsc, build, `tests/run-all.sh` |
| `/review-diff` | review the current uncommitted diff |

## Steering

`steering/*.md` is loaded on **every** turn: `api-frontend`, `athena-data`,
`code-style`, `infrastructure`, `security`, `testing`. Keep each to terse
bullets — long reference material belongs in a skill (loaded on demand) or in
`docs/`. Custom agents do not inherit workspace steering implicitly here; each
agent lists `file://.kiro/steering/**/*.md` in its `resources`.

## Relationship to `.claude/`

`.claude/` is the older Claude Code configuration, kept for anyone still using
that client. `.kiro/` is authoritative for this repo. The two are separate
contracts, not copies:

| `.claude/` | `.kiro/` |
|-----------|---------|
| `settings.json` → `hooks` | `agents/*.json` → `hooks` |
| `settings.json` → `permissions.deny` | `agents/*.json` → `toolsSettings.shell.deniedCommands` / `write.deniedPaths` |
| `CLAUDE_TOOL_*` env vars | JSON event on STDIN |
| `Notification` trigger | `stop` trigger |
| `SessionStart` trigger | `agentSpawn` trigger |
| `commands/*.md` | `prompts/*.md` |
| `agents/*.yml` | `agents/*.json` |
| `skills/<n>/SKILL.md` | `skills/<n>/SKILL.md` (same format; `name` + `description` frontmatter) |

Two facts were corrected while porting, because the Claude copies were stale:
the app has **no NextAuth and no `lib/auth.ts`** (auth is Lambda@Edge + Cognito
PKCE only), and the i18n hook is **`useI18n()`**, not `useLanguage()`.

Changes under `.kiro/` are covered by `tests/structure/test-kiro-config.sh` and
`tests/hooks/test-kiro-hooks.sh`, both run by `bash tests/run-all.sh`.
