#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${PROJECT_ROOT}"

npm run build
npm link

cat <<'EOF'
Expecto Cli linked successfully.

Credentials file:
  ~/.expecto-cli/session.env

Start interactive mode:
  expecto

Run one-shot:
  expecto "say hello in one sentence"
EOF
