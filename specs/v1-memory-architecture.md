# V1 Memory Architecture

## Memory Layers

### 1. Hot working memory

Stored as markdown.

Includes:

- `00-requirements.md`
- `01-plan.md`
- active task docs
- recent summaries

### 2. Structured runtime state

Stored as SQLite and/or JSON.

Includes:

- session index
- tool traces
- event logs
- active artifact pointers
- session snapshots

### 3. Project memory index

Stored as markdown.

Includes:

- `.beta-agent/memory/INDEX.md`
- topic files under:
  - `conventions/`
  - `workflows/`
  - `decisions/`
  - `lessons/`

### 4. Cold history

Not a primary `v1` context source.

For `v1`, prefer:

- metadata indexing
- keyword/full-text search

Defer heavier semantic retrieval or local RAG until later.

## Load Policy

Always load:

- `AGENTS.md`
- `.beta-agent/memory/INDEX.md`

Usually load:

- requirements summary
- plan summary
- active task
- most recent relevant summary

On-demand only:

- findings
- older summaries
- memory topic files
- lessons

## Summary Types

Keep these distinct:

- session summary
- task summary
- resume summary

## Open Issue

The exact `observer + instinct` boundary still needs a dedicated `v1` scope decision.
