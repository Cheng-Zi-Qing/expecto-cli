# beta-agent

`beta-agent` is a personal, CLI-first code agent runtime with:

- a Claude-like fullscreen terminal UI by default in interactive mode
- markdown-driven working memory
- layered instructions and project adaptation
- a governed evolution pipeline for workflow optimization
- limited, role-based subagents

## Current Status

The first interactive vertical slice is now implemented.

The current implementation priorities are:

1. harden the fullscreen TUI experience
2. improve markdown rendering, slash commands, and execution cards
3. deepen memory, workflow, and role support
4. keep module boundaries and stable contracts intact

## Source-of-Truth Design Material

The richer design docs currently live in the Obsidian vault at:

- `/Users/clement/Documents/Obsidian Vault/个性项目/beta-agent`

Repository-local summaries and implementation plans are tracked alongside the code.

## Current Repository Layout

```text
src/
  cli/
  contracts/
  core/
  memory/
  providers/
  runtime/
  tui/

plans/
specs/
tests/
```

## Current CLI Behavior

The current `v1` bootstrap supports:

- `beta` -> fullscreen TUI
- `beta "<prompt>"` -> fullscreen TUI with the first prompt sent on entry
- `beta -p "<prompt>"` -> plain one-shot execution

The runtime keeps a stable contract layer, markdown-driven project context loading, and renderer-agnostic runtime/provider plumbing.

## Local Install

The runtime supports a local credentials file at `~/.beta-agent/session.env`.

Recommended Anthropic / gateway setup:

```env
BETA_PROVIDER=anthropic
ANTHROPIC_AUTH_TOKEN=your_token
ANTHROPIC_BASE_URL=https://code.newcli.com/claude/ultra
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

One-time local install:

```bash
cd /Users/clement/Workspace/beta-agent
npm run install:local
```

After that:

```bash
beta
```

Interactive TUI shortcuts:

- `Enter` send
- `Ctrl+J` newline
- `Tab` toggle Context Inspector
- `Esc` focus timeline
- `i` return to composer
- `Ctrl+C` interrupt active generation
- `Ctrl+D` exit the fullscreen app

One-shot mode stays plain:

```bash
beta -p "say hello in one sentence"
```

## Development Entry

If you do not want to install the global `beta` command yet, use:

```bash
cd /Users/clement/Workspace/beta-agent
npm run dev
```

The CLI loads `~/.beta-agent/session.env` automatically. If you pass env vars explicitly in the shell, those values override the file.
