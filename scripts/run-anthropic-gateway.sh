#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ $# -eq 0 ]]; then
  PROMPT="say hello in one sentence"
else
  PROMPT="$*"
fi

if [[ -z "${ANTHROPIC_AUTH_TOKEN:-}" && -z "${ANTHROPIC_API_KEY:-}" && -z "${BETA_API_KEY:-}" ]]; then
  echo "Set ANTHROPIC_AUTH_TOKEN, ANTHROPIC_API_KEY, or BETA_API_KEY before running this script." >&2
  exit 1
fi

export ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-https://code.newcli.com/claude/ultra}"
export ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-claude-sonnet-4-20250514}"
export BETA_PROVIDER="${BETA_PROVIDER:-anthropic}"

cd "${PROJECT_ROOT}"
exec node --experimental-strip-types src/cli/entry.ts -p "${PROMPT}"
