# beta-agent Memory Index

## Purpose

This file is the short entrypoint for project memory.

Do not turn it into a long knowledge dump.
Use topic files when details grow.

## Current Stable Facts

- command name: `beta`
- Claude-like default interaction model
- `AGENTS.md` is primary public project guidance
- `.beta-agent/` stores private agent workspace state
- complex tasks use document layers:
  - requirements
  - plan
  - task
  - summary
- default mode: `balanced`
- `v1` subagents are read-only roles only

## Topic Files

- `decisions/` for architecture decisions
- `workflows/` for stable workflow patterns
- `conventions/` for repo conventions
- `lessons/` for promoted lessons

## Retrieval Policy

- load this file by default
- load topic files only when relevant
- prefer explicit active docs over broad historical recall
