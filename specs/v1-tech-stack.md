# V1 Tech Stack

## Runtime Choice

`v1` uses:

- Node.js 22+
- TypeScript
- ESM

## Why This Stack

### Product fit

- matches the CLI interaction model we want
- fits streaming terminal output and event-driven runtime design
- supports a plugin/skill-oriented architecture cleanly

### Build speed

- fast enough to validate architecture before optimizing for performance
- strong typing without sacrificing iteration speed

### Ecosystem fit

- strong support for CLI tooling
- strong support for local process orchestration
- easy future integration with multiple LLM providers

## Storage Split

- markdown for human-readable working memory
- SQLite/JSON for runtime state

## Core Libraries

- `zod` for contract validation
- `better-sqlite3` for local structured state
- `gray-matter` for markdown frontmatter parsing
- `globby` for workspace and artifact discovery
- `execa` for tool/runtime process execution
- `picocolors` for lightweight terminal styling

## Deliberate Non-Choices For V1

- no Rust core
- no Bun-only runtime lock-in
- no provider-locked architecture

## Provider Strategy

The runtime core must remain provider-agnostic.

Use a provider interface and add concrete adapters later, starting with Anthropic if needed.

See also:

- `specs/v1-provider-architecture.md`
