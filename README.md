# Expecto Cli

Expecto Cli is a terminal-first coding assistant project initiated by Harry Potter fans.

Part of the project comes from a simple intuition: modern large-model systems often feel surprisingly close to magic. Prompts, context, memory, tools, and orchestration can resemble spells, rules, artifacts, and rituals in a different form. Expecto Cli is an attempt to explore that feeling inside a real developer tool without giving up engineering clarity.

The project is intentionally built with a decoupled frontend and backend. The CLI frontend already has a visible first version that people can run and experience today, while the runtime and backend layers are still actively evolving. A few small easter eggs are also hidden in the CLI for curious users to discover.

## Current Status

- Frontend v1 is already visible and usable
- Backend and runtime capabilities are still under active iteration
- Frontend and backend are intentionally decoupled for faster evolution
- Contributions are welcome across engineering, design, docs, testing, and polish

## Why Expecto Cli

- It treats the terminal as the primary product surface rather than a fallback shell wrapper
- It embraces a strong identity, including house-based themes and a playful magical framing
- It keeps UI concerns and runtime/backend concerns separate so both sides can evolve faster
- It makes room for delight, including small CLI easter eggs, without turning into a joke project

## Architecture

### Frontend Surface

The current frontend is a themed terminal interface with a sticky main-screen layout, house selection, slash commands, execution inspection, and a visible interaction model that people can already try today.

### Runtime and Backend

The backend side is still being iterated. It is responsible for orchestration, provider integration, context assembly, execution flow, persistence, and the broader assistant runtime behavior behind the CLI surface.

### Decoupled Boundaries

Expecto Cli is being developed with clear separation between frontend presentation and backend/runtime logic. That split is intentional: the frontend can become more polished and expressive without being blocked by backend iteration, and the backend can keep evolving without forcing constant UI rewrites.

## What You Can Try Today

- Sticky main-screen interactive mode in the terminal
- Plain one-shot execution for direct prompts
- Native REPL mode
- House-based theme selection
- Slash commands such as `/help`, `/status`, `/theme`, `/branch`, `/inspect`, and `/exit`
- Saved execution logs for inspection in your pager

## Quick Start

### 1. Install

```bash
npm install
npm run build
npm run install:local
```

### 2. Configure Credentials

Create `~/.expecto-cli/session.env`:

```env
EXPECTO_PROVIDER=anthropic
EXPECTO_API_KEY=your_token
EXPECTO_BASE_URL=https://code.newcli.com/claude/ultra
EXPECTO_MODEL=claude-sonnet-4-20250514
```

### 3. Run

```bash
expecto
expecto "say hello in one sentence"
expecto --tui
expecto --native
```

## Interaction Model

### Interactive Mode

- `expecto`
- sticky main-screen terminal experience
- pinned composer at the bottom
- native scrollback still works
- `/theme` reopens the theme picker

### One-Shot Mode

```bash
expecto "summarize this repository"
```

### Built-In Commands

- `/help`
- `/status`
- `/clear`
- `/theme`
- `/branch`
- `/inspect <id>`
- `/exit`

## Contributing

Expecto Cli is still early, and help is welcome.

Good areas to contribute include:

- frontend interaction polish
- runtime and backend orchestration
- provider integrations
- docs and onboarding
- test coverage and bug fixing
- theme assets, branding details, and CLI polish

If you like Harry Potter, terminal tooling, or building distinctive developer products, you are very much the intended audience.

## Development

Run locally:

```bash
npm run dev
```

Verify changes:

```bash
npm test
npm run check
```

The CLI reads `~/.expecto-cli/session.env` automatically. Explicit environment variables still override values from that file.
