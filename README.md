# beta-agent

`beta-agent` is a personal, CLI-first code agent runtime with:

- a sticky-bottom main-screen terminal UI by default in interactive mode
- markdown-driven working memory
- layered instructions and project adaptation
- a governed evolution pipeline for workflow optimization
- limited, role-based subagents

## Current Status

The first interactive vertical slice is now implemented.

The current implementation priorities are:

1. harden the main-screen interactive experience
2. improve slash commands, execution inspection, and console projection
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

- `beta` -> sticky main-screen interactive mode (requires stdin + stdout TTY)
- `beta --tui` -> sticky main-screen interactive mode (requires stdin + stdout TTY)
- `beta --tui "<prompt>"` -> sticky main-screen interactive mode with the initial prompt submitted inside the app
- `beta "<prompt>"` -> plain one-shot execution (streams to stdout)
- `beta --native` -> native REPL (requires stdin + stdout TTY)
- `beta --native "<prompt>"` -> plain one-shot execution (streams to stdout)

If stdin or stdout is non-TTY, the CLI never starts interactive main-screen mode or REPL mode and falls back to single-shot stream semantics. If stdout is redirected while stdin is still interactive and no prompt was provided, the process fails fast with an error instead of opening an invisible interactive session.

## Deprecated Compatibility Surface

- `beta -p/--print "<prompt>"` -> deprecated alias for one-shot execution (emits a warning on stderr)

Deprecated environment knobs:

- `BETA_TUI_RENDERER=terminal` is deprecated and no longer controls routing (warning-only).

The runtime keeps a stable contract layer, markdown-driven project context loading, and renderer-agnostic runtime/provider plumbing.

## Interactive Main-Screen Mode

Interactive mode now stays on the terminal's main screen instead of switching to an alternate fullscreen buffer.

- Timeline/history is emitted as immutable stdout text.
- Native terminal scrollback, touchpad inertial scrolling, selection-copy, and terminal search keep working.
- The composer stays pinned to the bottom via terminal scroll-region control.
- Deep execution logs move out-of-band through `/inspect <execution-id>`, which opens the saved log in `$PAGER` (or `less`).
- History already written to stdout is not mutated in place.

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

Interactive shortcuts:

- `Enter` send
- `Alt+Enter` newline
- `Ctrl+J` newline
- `Ctrl+C` interrupt active generation
- `Ctrl+D` exit the interactive app

Primary built-in commands:

- `/help` show the visible built-in command list
- `/status` show the current session status
- `/clear` clear the current conversation history
- `/theme` reopen the local theme selector
- `/branch` show the current git branch for the project root
- `/exit` exit the current interactive session

Advanced log inspection:

- `/inspect <id>` open a saved execution log in `$PAGER` (or `less`)

One-shot mode stays plain:

```bash
beta "say hello in one sentence"
```

## Development Entry

If you do not want to install the global `beta` command yet, use:

```bash
cd /Users/clement/Workspace/beta-agent
npm run dev
```

The CLI loads `~/.beta-agent/session.env` automatically. If you pass env vars explicitly in the shell, those values override the file.
