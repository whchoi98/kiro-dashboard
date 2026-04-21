#!/usr/bin/env bash
# install-hooks.sh — Installs git hooks for the project
# Run after cloning to set up the local git hooks

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GIT_HOOKS_DIR="$PROJECT_ROOT/.git/hooks"

# Check if this is a git repo
if [[ ! -d "$PROJECT_ROOT/.git" ]]; then
  echo "Not a git repository. Initialize git first: git init"
  exit 1
fi

mkdir -p "$GIT_HOOKS_DIR"

echo "Installing git hooks into $GIT_HOOKS_DIR..."

# ---------------------------------------------------------------
# commit-msg hook: remove Co-Authored-By lines from commit messages
# (prevents AI assistants from appearing as contributors)
# ---------------------------------------------------------------
cat > "$GIT_HOOKS_DIR/commit-msg" << 'HOOK'
#!/usr/bin/env bash
# Remove Co-Authored-By lines from commit messages
COMMIT_MSG_FILE="$1"
if [[ -f "$COMMIT_MSG_FILE" ]]; then
  # Remove lines containing Co-Authored-By (case-insensitive)
  TMPFILE=$(mktemp)
  grep -iv "co-authored-by:" "$COMMIT_MSG_FILE" > "$TMPFILE" || true
  mv "$TMPFILE" "$COMMIT_MSG_FILE"
fi
exit 0
HOOK
chmod +x "$GIT_HOOKS_DIR/commit-msg"
echo "  Installed: commit-msg (strips Co-Authored-By)"

# ---------------------------------------------------------------
# pre-commit hook: run TypeScript check before committing
# ---------------------------------------------------------------
cat > "$GIT_HOOKS_DIR/pre-commit" << 'HOOK'
#!/usr/bin/env bash
# Run TypeScript check before committing
cd "$(git rev-parse --show-toplevel)"

echo "[pre-commit] Running TypeScript check..."
if ! npx tsc --noEmit 2>&1; then
  echo "[pre-commit] TypeScript errors found. Fix them before committing."
  exit 1
fi
echo "[pre-commit] TypeScript OK"
exit 0
HOOK
chmod +x "$GIT_HOOKS_DIR/pre-commit"
echo "  Installed: pre-commit (TypeScript check)"

echo ""
echo "Git hooks installed successfully."
echo ""
echo "Hooks installed:"
echo "  .git/hooks/commit-msg   — strips Co-Authored-By lines"
echo "  .git/hooks/pre-commit   — TypeScript check before commit"
