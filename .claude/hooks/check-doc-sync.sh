#!/usr/bin/env bash
# PostToolUse hook: checks if code changes in app/ or lib/ need doc updates
# Fires after Write/Edit tool calls on source files

set -euo pipefail

TOOL_NAME="${CLAUDE_TOOL_NAME:-}"
FILE_PATH="${CLAUDE_TOOL_INPUT_FILE_PATH:-${CLAUDE_TOOL_INPUT_PATH:-}}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Only run for write/edit operations
if [[ "$TOOL_NAME" != "Write" && "$TOOL_NAME" != "Edit" ]]; then
  exit 0
fi

# Only check source files in app/ or lib/
if [[ -z "$FILE_PATH" ]]; then
  exit 0
fi

# Normalize path relative to project root
REL_PATH="${FILE_PATH#$PROJECT_ROOT/}"

# Check if the changed file is in app/ or lib/
if [[ "$REL_PATH" != app/* && "$REL_PATH" != lib/* ]]; then
  exit 0
fi

MISSING_DOCS=()

# Check for new API route
if [[ "$REL_PATH" == app/api/*/route.ts ]]; then
  API_DIR=$(echo "$REL_PATH" | cut -d'/' -f3)
  if ! grep -q "$API_DIR" "$PROJECT_ROOT/app/api/CLAUDE.md" 2>/dev/null; then
    MISSING_DOCS+=("app/api/CLAUDE.md (new endpoint: $API_DIR)")
  fi
fi

# Check for new component
if [[ "$REL_PATH" == app/components/* && "$REL_PATH" == *.tsx ]]; then
  COMPONENT_NAME=$(basename "$FILE_PATH" .tsx)
  if ! grep -q "$COMPONENT_NAME" "$PROJECT_ROOT/app/components/CLAUDE.md" 2>/dev/null; then
    MISSING_DOCS+=("app/components/CLAUDE.md (new component: $COMPONENT_NAME)")
  fi
fi

# Check for new lib file
if [[ "$REL_PATH" == lib/*.ts || "$REL_PATH" == lib/*.tsx ]]; then
  LIB_NAME=$(basename "$FILE_PATH")
  if ! grep -q "$LIB_NAME" "$PROJECT_ROOT/lib/CLAUDE.md" 2>/dev/null; then
    MISSING_DOCS+=("lib/CLAUDE.md (new file: $LIB_NAME)")
  fi
fi

# Walk up to find parent directory CLAUDE.md
PARENT_DIR=$(dirname "$FILE_PATH")
while [[ "$PARENT_DIR" != "$PROJECT_ROOT" && "$PARENT_DIR" != "/" ]]; do
  if [[ -f "$PARENT_DIR/CLAUDE.md" ]]; then
    break
  fi
  PARENT_DIR=$(dirname "$PARENT_DIR")
done

if [[ ${#MISSING_DOCS[@]} -gt 0 ]]; then
  echo ""
  echo "[doc-sync] Documentation may need updating:"
  for doc in "${MISSING_DOCS[@]}"; do
    echo "  - $doc"
  done
  echo "  Run /sync-docs to synchronize all module documentation."
  echo ""
fi

exit 0
