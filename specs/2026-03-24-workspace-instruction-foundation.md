# Workspace And Instruction Foundation

## Goal

Define the minimum contract changes needed to turn the existing runtime shell into a real Markdown-driven workspace without destabilizing the current fullscreen TUI path.

## Contract Boundary

The system keeps two storage classes:

- Markdown artifacts for human-readable working memory
- structured runtime state for session snapshots, traces, and catch-up metadata

These two layers cooperate, but they do not collapse into one format.

## Markdown Artifacts

Markdown artifacts remain the source of truth for collaborative work state:

- requirements
- plan
- task
- summary
- findings

Artifact refs and documents may now carry optional metadata. This metadata is for orchestration, not for replacing the Markdown body.

Examples:

- `initiativeId`
- `taskId`
- `updatedAt`
- future workspace lifecycle hints

The Markdown body still carries the durable human-readable content.

## Structured Session State

Session snapshots remain the source of truth for runtime continuity:

- current session state
- active artifacts
- activated skills
- recent tool history
- compacted summary text

Snapshots now also allow a small structured summary object. This is intentionally narrow:

- `headline`
- `currentTaskId`
- `nextStep`

The purpose of this object is to support resume and catch-up flows without forcing every consumer to parse freeform compacted text.

## Bootstrap Assumptions

Bootstrap/runtime layers may assume:

- artifact refs can expose orchestration metadata when available
- session snapshots can expose a compact structured resume summary
- missing metadata is valid and must not break existing flows

Bootstrap/runtime layers must not assume:

- every artifact already has rich metadata
- artifact metadata is a replacement for reading Markdown content
- session snapshots contain enough information to skip active artifact loading

## Non-Goals

This contract pass does not yet define:

- full artifact lifecycle rules
- instruction priority resolution
- task summary generation strategy
- command system contracts

Those come in later tasks once the base contracts are stable.
