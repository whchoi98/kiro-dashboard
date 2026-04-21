#!/usr/bin/env bash
# setup.sh — Project setup script for new developers
# Run once after cloning to set up the local development environment

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

echo "================================================================"
echo " kiro-dashboard — Project Setup"
echo "================================================================"
echo ""

# ---------------------------------------------------------------
# 1. Check prerequisites
# ---------------------------------------------------------------
echo "Checking prerequisites..."

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "  ERROR: $1 is not installed. Please install it and re-run."
    exit 1
  fi
  echo "  OK: $1 ($(command -v "$1"))"
}

check_cmd node
check_cmd npm
check_cmd docker
check_cmd aws

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [[ $NODE_MAJOR -lt 18 ]]; then
  echo "  ERROR: Node.js 18+ required (found $NODE_VERSION)"
  exit 1
fi
echo "  OK: Node.js v$NODE_VERSION"

echo ""

# ---------------------------------------------------------------
# 2. Install npm dependencies
# ---------------------------------------------------------------
echo "Installing npm dependencies..."
npm install
echo "  Done."
echo ""

# ---------------------------------------------------------------
# 3. Install CDK dependencies
# ---------------------------------------------------------------
echo "Installing CDK dependencies..."
cd infra && npm install && cd ..
echo "  Done."
echo ""

# ---------------------------------------------------------------
# 4. Set up .env.local
# ---------------------------------------------------------------
if [[ ! -f ".env.local" ]]; then
  echo "Setting up .env.local from .env.example..."
  cp .env.example .env.local
  echo "  Created .env.local — please edit it with your actual values."
else
  echo "  .env.local already exists — skipping."
fi
echo ""

# ---------------------------------------------------------------
# 5. TypeScript check
# ---------------------------------------------------------------
echo "Running TypeScript check..."
npx tsc --noEmit && echo "  TypeScript: OK" || echo "  TypeScript: errors found (see above)"
echo ""

# ---------------------------------------------------------------
# 6. Optional: Docker build test
# ---------------------------------------------------------------
read -r -p "Build Docker image? (y/N): " BUILD_DOCKER
if [[ "${BUILD_DOCKER,,}" == "y" ]]; then
  echo "Building Docker image..."
  docker build -t kiro-dashboard .
  echo "  Docker build: OK"
fi
echo ""

# ---------------------------------------------------------------
# Done
# ---------------------------------------------------------------
echo "================================================================"
echo " Setup complete!"
echo ""
echo " Next steps:"
echo "  1. Edit .env.local with your AWS config values"
echo "  2. Run: npm run dev"
echo "  3. Open: http://localhost:3000"
echo "================================================================"
