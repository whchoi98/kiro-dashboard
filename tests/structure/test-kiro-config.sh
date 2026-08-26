#!/usr/bin/env bash
# tests/structure/test-kiro-config.sh — validates the .kiro/ workspace config:
# agents parse and reference real hooks, skills carry frontmatter, steering
# exists, settings use documented values, and stale project facts stay out.

set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
KIRO="$PROJECT_ROOT/.kiro"
PASS=0
FAIL=0
TOTAL=0

ok() {
  TOTAL=$((TOTAL + 1)); PASS=$((PASS + 1))
  echo "ok $TOTAL - $1"
}

not_ok() {
  TOTAL=$((TOTAL + 1)); FAIL=$((FAIL + 1))
  echo "not ok $TOTAL - $1"
  echo "  # $2"
}

assert_file() {
  if [[ -f "$PROJECT_ROOT/$1" ]]; then ok "file: $1"; else not_ok "file: $1" "missing"; fi
}

assert_dir() {
  if [[ -d "$PROJECT_ROOT/$1" ]]; then ok "dir: $1"; else not_ok "dir: $1" "missing"; fi
}

json_valid() {
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))' "$1" 2>/dev/null
}

json_query() {
  # $1 = file, $2 = JS expression over `cfg`
  node -e '
    const cfg = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const out = eval(process.argv[2]);
    process.stdout.write(out === undefined || out === null ? "" : String(out));
  ' "$1" "$2" 2>/dev/null
}

echo "# .kiro layout"
for d in .kiro/agents .kiro/hooks .kiro/hooks/lib .kiro/prompts .kiro/settings .kiro/skills .kiro/steering; do
  assert_dir "$d"
done
assert_file ".kiro/AGENTS.md"
assert_file ".kiro/settings/cli.json"

echo ""
echo "# Agents parse and declare a name matching the filename"
AGENTS=(kiro-dashboard-dev security-auditor code-reviewer)
for agent in "${AGENTS[@]}"; do
  FILE="$KIRO/agents/$agent.json"
  if [[ ! -f "$FILE" ]]; then
    not_ok "agent: $agent.json" "missing"
    continue
  fi
  if json_valid "$FILE"; then
    ok "agent parses: $agent.json"
  else
    not_ok "agent parses: $agent.json" "invalid JSON"
    continue
  fi
  NAME="$(json_query "$FILE" 'cfg.name')"
  if [[ "$NAME" == "$agent" ]]; then
    ok "agent name matches filename: $agent"
  else
    not_ok "agent name matches filename: $agent" "name field is '$NAME'"
  fi
  DESC="$(json_query "$FILE" 'cfg.description ? "yes" : ""')"
  PROMPT="$(json_query "$FILE" 'cfg.prompt ? "yes" : ""')"
  if [[ "$DESC" == "yes" && "$PROMPT" == "yes" ]]; then
    ok "agent has description + prompt: $agent"
  else
    not_ok "agent has description + prompt: $agent" "description or prompt missing"
  fi
done

echo ""
echo "# Agent tool names are Kiro tools"
KNOWN_TOOLS='read write shell grep glob code knowledge use_aws web_fetch web_search introspect subagent todo_list thinking'
for agent in "${AGENTS[@]}"; do
  FILE="$KIRO/agents/$agent.json"
  [[ -f "$FILE" ]] || continue
  UNKNOWN="$(KNOWN="$KNOWN_TOOLS" json_query "$FILE" '
    (cfg.tools || []).filter(t => t !== "*" && !process.env.KNOWN.split(" ").includes(t)).join(",")
  ')"
  if [[ -z "$UNKNOWN" ]]; then
    ok "known tools only: $agent"
  else
    not_ok "known tools only: $agent" "unknown tool(s): $UNKNOWN"
  fi
done

echo ""
echo "# Read-only agents cannot write or run arbitrary shell"
for agent in security-auditor code-reviewer; do
  FILE="$KIRO/agents/$agent.json"
  [[ -f "$FILE" ]] || continue
  HAS_WRITE="$(json_query "$FILE" '(cfg.tools || []).includes("write") ? "yes" : ""')"
  if [[ -z "$HAS_WRITE" ]]; then
    ok "no write tool: $agent"
  else
    not_ok "no write tool: $agent" "review/audit agents must not modify files"
  fi
done
DENY_BY_DEFAULT="$(json_query "$KIRO/agents/code-reviewer.json" '((cfg.toolsSettings||{}).shell||{}).denyByDefault ? "yes" : ""')"
if [[ "$DENY_BY_DEFAULT" == "yes" ]]; then
  ok "code-reviewer shell is denyByDefault"
else
  not_ok "code-reviewer shell is denyByDefault" "shell must be allowlisted for a review agent"
fi

echo ""
echo "# Destructive commands stay denied (ported from .claude permissions.deny)"
DEV_AGENT="$KIRO/agents/kiro-dashboard-dev.json"
for pattern in 'rm' 'push' 'reset' 'checkout' 'clean'; do
  HIT="$(PAT="$pattern" json_query "$DEV_AGENT" '
    (((cfg.toolsSettings||{}).shell||{}).deniedCommands||[]).some(c => c.includes(process.env.PAT)) ? "yes" : ""
  ')"
  if [[ "$HIT" == "yes" ]]; then
    ok "deniedCommands covers: $pattern"
  else
    not_ok "deniedCommands covers: $pattern" "no deny rule mentions '$pattern'"
  fi
done
for denied in '.env' 'node_modules/**'; do
  HIT="$(PAT="$denied" json_query "$DEV_AGENT" '
    (((cfg.toolsSettings||{}).write||{}).deniedPaths||[]).some(p => p === process.env.PAT || p.startsWith(process.env.PAT)) ? "yes" : ""
  ')"
  if [[ "$HIT" == "yes" ]]; then
    ok "write deniedPaths covers: $denied"
  else
    not_ok "write deniedPaths covers: $denied" "not in write.deniedPaths"
  fi
done

echo ""
echo "# Hook commands reference scripts that exist"
for agent in "${AGENTS[@]}"; do
  FILE="$KIRO/agents/$agent.json"
  [[ -f "$FILE" ]] || continue
  SCRIPTS="$(json_query "$FILE" '
    Object.values(cfg.hooks || {}).flat().map(h => h.command || (h.action||{}).command || "").join("\n")
  ')"
  [[ -n "$SCRIPTS" ]] || { ok "no hooks declared: $agent"; continue; }
  MISSING=""
  while IFS= read -r cmd; do
    [[ -n "$cmd" ]] || continue
    script="$(sed -n 's/^bash \(.*\)$/\1/p' <<< "$cmd")"
    [[ -n "$script" ]] || continue
    [[ -f "$PROJECT_ROOT/$script" ]] || MISSING="$MISSING $script"
  done <<< "$SCRIPTS"
  if [[ -z "$MISSING" ]]; then
    ok "hook scripts exist: $agent"
  else
    not_ok "hook scripts exist: $agent" "missing:$MISSING"
  fi
done

echo ""
echo "# Dev agent wires all four triggers"
for trigger in agentSpawn preToolUse postToolUse stop; do
  HIT="$(T="$trigger" json_query "$DEV_AGENT" '(cfg.hooks||{})[process.env.T] ? "yes" : ""')"
  if [[ "$HIT" == "yes" ]]; then
    ok "trigger wired: $trigger"
  else
    not_ok "trigger wired: $trigger" "not present in kiro-dashboard-dev hooks"
  fi
done
MATCHER="$(json_query "$DEV_AGENT" '((cfg.hooks||{}).preToolUse||[])[0].matcher')"
if [[ "$MATCHER" == "write" ]]; then
  ok "secret-scan matcher targets write"
else
  not_ok "secret-scan matcher targets write" "matcher is '$MATCHER'"
fi

echo ""
echo "# Dev agent loads steering and skills as resources"
for res in '.kiro/steering' 'skill://'; do
  HIT="$(R="$res" json_query "$DEV_AGENT" '(cfg.resources||[]).some(r => r.includes(process.env.R)) ? "yes" : ""')"
  if [[ "$HIT" == "yes" ]]; then
    ok "resource includes: $res"
  else
    not_ok "resource includes: $res" "custom agents do not inherit these implicitly"
  fi
done

echo ""
echo "# Settings"
CLI_JSON="$KIRO/settings/cli.json"
if json_valid "$CLI_JSON"; then
  ok "settings/cli.json parses"
else
  not_ok "settings/cli.json parses" "invalid JSON"
fi
DEFAULT_AGENT="$(json_query "$CLI_JSON" 'cfg["chat.defaultAgent"]')"
if [[ -f "$KIRO/agents/$DEFAULT_AGENT.json" ]]; then
  ok "chat.defaultAgent points at an existing agent ($DEFAULT_AGENT)"
else
  not_ok "chat.defaultAgent points at an existing agent" "no agent file for '$DEFAULT_AGENT'"
fi
INDEX_TYPE="$(json_query "$CLI_JSON" 'cfg["knowledge.indexType"]')"
if [[ "$INDEX_TYPE" == "fast" || "$INDEX_TYPE" == "best" ]]; then
  ok "knowledge.indexType is a documented value ($INDEX_TYPE)"
else
  not_ok "knowledge.indexType is a documented value" "got '$INDEX_TYPE' (expected fast|best)"
fi

echo ""
echo "# Steering files"
for f in api-frontend athena-data code-style infrastructure security testing; do
  assert_file ".kiro/steering/$f.md"
done
if grep -rqi "nextauth\|lib/auth\.ts" "$KIRO/steering" 2>/dev/null; then
  if grep -rqi "there is no NextAuth\|no \`lib/auth.ts\`" "$KIRO/steering" 2>/dev/null; then
    ok "steering only mentions NextAuth to state it is absent"
  else
    not_ok "steering only mentions NextAuth to state it is absent" "stale NextAuth/lib/auth.ts guidance"
  fi
else
  ok "steering carries no stale NextAuth guidance"
fi
if grep -rq "4-stack\|4 stacks" "$KIRO/steering" "$KIRO/skills" 2>/dev/null; then
  not_ok "no stale stack count" "found '4-stack' — the graph is 4 core stacks plus the opt-in Catalog and must be described as such"
else
  ok "no stale 4-stack claim in steering/skills"
fi
if grep -rq "npm run lint" "$KIRO/steering/testing.md" 2>/dev/null; then
  ok "testing steering documents the broken lint script"
else
  not_ok "testing steering documents the broken lint script" "npm run lint warning missing"
fi
if grep -rqi "useLanguage()" "$KIRO/steering" "$KIRO/skills" 2>/dev/null; then
  # A mention is fine only when it states the hook does not exist.
  if grep -rqiE 'n(o|ot) `?useLanguage' "$KIRO/steering" "$KIRO/skills" 2>/dev/null; then
    ok "useLanguage() only mentioned to state it is absent"
  else
    not_ok "i18n hook name is correct" "useLanguage() does not exist — the hook is useI18n()"
  fi
else
  ok "no stale useLanguage() reference (the hook is useI18n)"
fi

echo ""
echo "# Skills have name + description frontmatter"
SKILL_COUNT=0
for skill in "$KIRO"/skills/*/SKILL.md; do
  [[ -f "$skill" ]] || continue
  SKILL_COUNT=$((SKILL_COUNT + 1))
  DIR_NAME="$(basename "$(dirname "$skill")")"
  if [[ "$(head -1 "$skill")" != "---" ]]; then
    not_ok "frontmatter starts at line 1: $DIR_NAME" "first line is not ---"
    continue
  fi
  FM="$(sed -n '2,/^---$/p' "$skill")"
  NAME="$(sed -n 's/^name:[[:space:]]*//p' <<< "$FM" | head -1)"
  DESC="$(sed -n 's/^description:[[:space:]]*//p' <<< "$FM" | head -1)"
  if [[ "$NAME" == "$DIR_NAME" ]]; then
    ok "skill name matches directory: $DIR_NAME"
  else
    not_ok "skill name matches directory: $DIR_NAME" "frontmatter name is '$NAME'"
  fi
  if [[ -n "$DESC" ]]; then
    ok "skill has description: $DIR_NAME"
  else
    not_ok "skill has description: $DIR_NAME" "description missing — it is what makes the skill discoverable"
  fi
done
if [[ $SKILL_COUNT -ge 7 ]]; then
  ok "workspace skills present ($SKILL_COUNT)"
else
  not_ok "workspace skills present" "expected at least 7, found $SKILL_COUNT"
fi

echo ""
echo "# Ported .claude assets have a Kiro counterpart"
for skill in code-review-guide refactor-guide release-guide sync-docs-guide cdk-deploy-guide; do
  assert_file ".kiro/skills/$skill/SKILL.md"
done
assert_file ".kiro/prompts/test-all.md"
assert_file ".kiro/prompts/review-diff.md"

echo ""
echo "# Prompts and skills do not share a slash-command name"
COLLISION=""
for prompt in "$KIRO"/prompts/*.md; do
  [[ -f "$prompt" ]] || continue
  BASE="$(basename "$prompt" .md)"
  [[ -d "$KIRO/skills/$BASE" ]] && COLLISION="$COLLISION $BASE"
done
if [[ -z "$COLLISION" ]]; then
  ok "no prompt/skill name collision"
else
  not_ok "no prompt/skill name collision" "file prompts shadow skills:$COLLISION"
fi

echo ""
echo "# Prompts do not tell the agent to run the broken lint script"
if grep -rqE '^\s*npm run lint\s*$' "$KIRO/prompts" 2>/dev/null; then
  not_ok "prompts avoid npm run lint" "npm run lint hangs on an interactive setup prompt"
else
  ok "prompts avoid running npm run lint"
fi

echo ""
echo "# kiro-cli schema validation (skipped when kiro-cli is absent)"
if command -v kiro-cli >/dev/null 2>&1; then
  for agent in "${AGENTS[@]}"; do
    FILE="$KIRO/agents/$agent.json"
    [[ -f "$FILE" ]] || continue
    # `agent validate` exits 0 even on error, so the signal is empty STDERR.
    ERR="$(kiro-cli agent validate --path "$FILE" 2>&1 >/dev/null)"
    if [[ -z "$ERR" ]]; then
      ok "kiro-cli accepts agent: $agent"
    else
      not_ok "kiro-cli accepts agent: $agent" "$ERR"
    fi
  done
else
  ok "kiro-cli not installed — schema validation skipped"
fi

echo ""
echo "# Summary: $TOTAL tests, $PASS passed, $FAIL failed"
[[ $FAIL -gt 0 ]] && exit 1
exit 0
