#!/usr/bin/env bash
# .kiro/hooks/lib/event.sh — shared helper for Kiro hook scripts.
#
# Usage (from a hook script):
#   source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/event.sh"
#   hook_load_event            # reads STDIN, sets the HOOK_* variables
#
# Sets: HOOK_EVENT HOOK_CWD HOOK_TOOL HOOK_PATH HOOK_CONTENT HOOK_PROMPT
#       HOOK_RESPONSE HOOK_SUCCESS HOOK_RAW
#
# Every value defaults to "" so a hook can run with an empty or malformed
# event (fail open) instead of aborting the tool call it is attached to.

HOOK_LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_PROJECT_ROOT="$(cd "$HOOK_LIB_DIR/../../.." && pwd)"

hook_load_event() {
  HOOK_RAW="$(cat 2>/dev/null || true)"
  HOOK_EVENT=""; HOOK_CWD=""; HOOK_TOOL=""; HOOK_PATH=""
  HOOK_CONTENT=""; HOOK_PROMPT=""; HOOK_RESPONSE=""; HOOK_SUCCESS=""

  local parsed=""
  if command -v node >/dev/null 2>&1; then
    parsed="$(printf '%s' "$HOOK_RAW" | node "$HOOK_LIB_DIR/parse-event.js" 2>/dev/null || true)"
  fi

  if [[ -n "$parsed" ]]; then
    # Safe to eval: the parser only emits KEY_B64=<base64> lines.
    local line key value
    while IFS= read -r line; do
      [[ "$line" =~ ^[A-Z_]+_B64=[A-Za-z0-9+/=]*$ ]] || continue
      key="${line%%=*}"
      value="${line#*=}"
      printf -v "${key%_B64}" '%s' "$(printf '%s' "$value" | base64 -d 2>/dev/null || true)"
    done <<< "$parsed"
  else
    # Node unavailable or payload unparseable: recover just the path with sed so
    # path-based skip rules still apply, and treat the raw payload as the text
    # to scan.
    HOOK_PATH="$(printf '%s' "$HOOK_RAW" \
      | sed -n 's/.*"path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    HOOK_CONTENT="$HOOK_RAW"
  fi

  export HOOK_EVENT HOOK_CWD HOOK_TOOL HOOK_PATH HOOK_CONTENT \
         HOOK_PROMPT HOOK_RESPONSE HOOK_SUCCESS HOOK_RAW
}

# True when the event describes a file-writing tool call. Kiro's `matcher`
# already narrows this, but hooks are also invoked directly in tests and a
# matcher-less config would pass every tool through.
hook_is_write() {
  case "$HOOK_TOOL" in
    write|fs_write|fsWrite|"") return 0 ;;
    *) return 1 ;;
  esac
}
