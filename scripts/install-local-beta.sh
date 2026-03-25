#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

npm run build
npm link

cat <<'EOF'
beta linked successfully.

Credentials file:
  ~/.beta-agent/session.env

Start interactive mode:
  beta

Run one-shot:
  beta -p "say hello in one sentence"
EOF
