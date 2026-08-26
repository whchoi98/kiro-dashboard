#!/usr/bin/env bash
# .kiro/hooks/check-doc-sync.sh
# Trigger: postToolUse, matcher "write" — advisory reminder that a new route,
# component or lib module is not yet described in its module doc.
#
# The tool has already run at this point, so this hook always exits 0; any
# other exit code only surfaces a warning to the user.

set -uo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/event.sh"
hook_load_event

hook_is_write || exit 0

PROJECT_ROOT="$HOOK_PROJECT_ROOT"
FILE_PATH="$HOOK_PATH"
[[ -n "$FILE_PATH" ]] || exit 0

REL_PATH="${FILE_PATH#"$PROJECT_ROOT"/}"
REL_PATH="${REL_PATH#./}"

# Only app/ and lib/ carry per-module docs.
case "$REL_PATH" in
  app/*|lib/*) ;;
  *) exit 0 ;;
esac

# Module docs are still named CLAUDE.md in this repo; AGENTS.md is Kiro's
# marker file. Accept either so a future rename needs no hook change.
module_doc() {
  local dir="$1"
  for candidate in "$dir/AGENTS.md" "$dir/CLAUDE.md"; do
    [[ -f "$candidate" ]] && { printf '%s' "$candidate"; return 0; }
  done
  return 1
}

doc_mentions() {
  local doc="$1" needle="$2"
  grep -q -- "$needle" "$doc" 2>/dev/null
}

MISSING=()

# New API route
if [[ "$REL_PATH" == app/api/*/route.ts ]]; then
  ROUTE="$(cut -d'/' -f3 <<< "$REL_PATH")"
  if DOC="$(module_doc "$PROJECT_ROOT/app/api")" && ! doc_mentions "$DOC" "$ROUTE"; then
    MISSING+=("${DOC#"$PROJECT_ROOT"/} — new endpoint: /api/$ROUTE")
  fi
fi

# New component
if [[ "$REL_PATH" == app/components/*.tsx ]]; then
  COMPONENT="$(basename "$FILE_PATH" .tsx)"
  if DOC="$(module_doc "$PROJECT_ROOT/app/components")" && ! doc_mentions "$DOC" "$COMPONENT"; then
    MISSING+=("${DOC#"$PROJECT_ROOT"/} — new component: $COMPONENT")
  fi
fi

# New lib module
if [[ "$REL_PATH" == lib/*.ts || "$REL_PATH" == lib/*.tsx ]]; then
  LIB="$(basename "$FILE_PATH")"
  if DOC="$(module_doc "$PROJECT_ROOT/lib")" && ! doc_mentions "$DOC" "$LIB"; then
    MISSING+=("${DOC#"$PROJECT_ROOT"/} — new file: lib/$LIB")
  fi
fi

# New page → the root project docs list the page tree
if [[ "$REL_PATH" == app/*/page.tsx ]]; then
  PAGE="$(cut -d'/' -f2 <<< "$REL_PATH")"
  for ROOT_DOC in AGENTS.md CLAUDE.md README.md; do
    if [[ -f "$PROJECT_ROOT/$ROOT_DOC" ]] && ! doc_mentions "$PROJECT_ROOT/$ROOT_DOC" "$PAGE"; then
      MISSING+=("$ROOT_DOC — new page: /$PAGE")
    fi
  done
fi

if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "[doc-sync] documentation may be out of date:"
  for entry in "${MISSING[@]}"; do
    echo "  - $entry"
  done
  echo "  Run /sync-docs-guide to reconcile module docs with the source tree."
fi

exit 0
