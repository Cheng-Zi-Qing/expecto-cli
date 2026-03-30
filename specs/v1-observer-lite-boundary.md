# V1 Observer-Lite Boundary

## Purpose

`observer-lite` exists to capture useful workflow signals without letting `v1` mutate its own behavior in the background.

The goal is to preserve the value of ECC-style evolution:

- observe what happened
- extract candidate lessons or instincts
- present them for human review

without taking on the full risk of automatic promotion or automatic workflow mutation in `v1`.

## V1 Goals

- capture runtime observations from stable event streams
- persist those observations in structured storage
- derive draft lesson / instinct candidates
- surface those candidates through explicit human-facing review flows

## V1 Non-Goals

- automatic promote
- automatic evolve
- automatic activation of generated skills, commands, or prompts
- unaudited background mutation of project or global state
- blocking the main turn loop with high-frequency observer work

## Boundary

### Allowed in `v1`

- read-only observation of runtime events
- observation persistence in SQLite and/or JSON
- low-frequency candidate generation from observations, summaries, and reviews
- explicit human review before any durable workflow asset is promoted
- manual lesson capture as a first-class fallback path

### Not Allowed in `v1`

- background self-modification
- silent updates to `AGENTS.md`, `.expecto-cli/docs/`, or active skills
- automatic promotion from observation to lesson, skill, command, or hook
- automatic enabling of promoted assets in future sessions
- non-audited writes outside the observer-owned storage area

## Data Flow

```text
runtime events
  -> observer-lite collector
  -> structured observation store
  -> candidate extraction
  -> human review surface
  -> manual promote/evolve decision
```

`v1` stops before the final promotion step.

## Storage Split

### Structured state

Use private support storage for raw observations and indexes:

- `.expecto-cli/state/observations/`
- `.expecto-cli/state/observer/`

This layer is machine-oriented, append-friendly, and not loaded into context by default.

### Human-review artifacts

Use markdown for reviewable candidate outputs:

- `.expecto-cli/evolution/candidates/`
- `.expecto-cli/memory/lessons/`

Candidates are drafts. Lessons are approved artifacts. Neither should be auto-loaded into the hot context path unless explicitly requested.

## Module Boundary

### Runtime core

- emits events
- does not know how evolution decisions are made

### Observer-lite

- subscribes to event streams
- writes observation records
- can create draft candidates
- cannot change runtime policy on its own

### Promotion / evolution

- out of scope for `v1`
- future module, invoked explicitly and governed

This split keeps the runtime, memory system, and evolution path decoupled.

## Trigger Policy

- observation capture must be non-blocking by default
- expensive analysis must run asynchronously or on explicit user request
- observer failure must degrade to `warn`, not break the session
- high-frequency tools must support sampling, batching, or summarization

## Review Surface

The first `v1` UX should be read-only or human-confirmed:

- `/insights` to inspect recent observer output
- manual lesson capture for direct human input
- explicit candidate review before promotion

No always-on autopilot workflow should exist in `v1`.

## Contract Consequences

The current frozen contracts already support this boundary:

- runtime events provide the observation source
- artifact contracts cover human-readable review outputs
- session snapshots provide resume-safe context for later candidate extraction

What is intentionally missing from `v1` contracts:

- confidence scoring
- promotion state machines
- automatic rollback / revoke flows
- auto-generated skill manifests

Those belong to a later evolution phase, not the bootstrap runtime.

## Recommended V1 Cut

Treat `observer-lite` as:

- event capture
- observation storage
- candidate drafting

Treat full ECC-style evolution as:

- promote
- evolve
- activate
- audit / rollback governance

That second group should wait for `v1.5+`.
