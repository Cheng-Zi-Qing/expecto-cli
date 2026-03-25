# Bootstrap Decisions

## Frozen Decisions

- Product shape: `CLI-first`
- Public command name: `beta`
- Interaction model: Claude-like
  - `beta`
  - `beta "<prompt>"`
  - `beta -p "<prompt>"`
- Project entrypoint: `AGENTS.md` as primary, `.beta-agent/` as private support layer
- Project doc workspace: `<repo>/.beta-agent/docs/`
- Complex-task minimum documents:
  - `requirements`
  - `plan`
  - `task`
  - `summary`
- `findings` is optional and research-only
- Storage model: `Markdown + SQLite/JSON`
- Contracts must be defined before runtime implementation expands
- `v1` subagents are read-only roles only
- Default mode: `balanced`
- Hooks policy: minimal, non-blocking by default

## Open Decisions Still Needing Follow-Up

- cold-history retrieval strategy:
  - markdown + metadata index only
  - or semantic retrieval / local RAG in a later phase
- exact scope of the `observer + instinct` subsystem for `v1`
- artifact activation logic and token-budget policy

## Immediate Build Order

1. contracts
2. artifact workspace
3. CLI/runtime skeleton
4. memory summaries and session snapshots
5. workflow resolver
6. read-only role runtime
