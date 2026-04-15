# Expecto Cli Requirements

## Product Shape

- `CLI-first`
- public command name: `expecto`
- interaction model should feel like Claude Code:
  - `expecto`
  - `expecto "<prompt>"`
  - `expecto -p "<prompt>"`

## Core Goals

1. Build a personal code-agent runtime that is stable over long tasks.
2. Make markdown documents first-class working memory.
3. Keep architecture modular and contract-driven.
4. Support project adaptation via `AGENTS.md` and project-local state.
5. Add workflow optimization through a governed evolution pipeline.

## Non-Goals for V1

- marketplace
- heavy IDE integration
- cloud sync
- heavy write-capable multi-agent orchestration
- fully automatic global learning with no human approval

## Working Principles

- `AGENTS.md` is the primary project entrypoint.
- `.expecto-cli/` is the private agent workspace.
- complex tasks should use:
  - requirements
  - plan
  - task
  - summary
- findings are research-only
- contracts are frozen early
- default mode is `balanced`

## Open Questions

- exact cold-memory retrieval approach:
  - markdown + metadata index only
  - or later semantic retrieval
- exact `observer + instinct` scope for `v1`
- final toolchain choice for implementation
