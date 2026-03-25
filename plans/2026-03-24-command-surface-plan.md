# Command Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real built-in slash-command surface to `beta` so session commands are no longer hardcoded in the interactive loop and the TUI can grow a command palette on top of a stable runtime command registry.

**Architecture:** Keep command parsing and execution renderer-agnostic. Add a command registry plus a small runtime command executor that returns structured effects such as `exit`, `clear`, and `system_message`. After the runtime command layer is stable, expose matching command suggestions in the TUI without moving command semantics into the renderer.

**Tech Stack:** Node.js 22+, TypeScript, ESM, Node test runner, existing runtime session loop, fullscreen TUI adapter

---

## File Map

- Create: `src/commands/command-types.ts`
- Create: `src/commands/builtin-commands.ts`
- Create: `src/commands/command-parser.ts`
- Create: `src/commands/command-executor.ts`
- Create: `tests/commands/builtin-commands.test.ts`
- Modify: `src/runtime/runtime-session.ts`
- Modify: `src/runtime/bootstrap-context.ts`
- Modify: `src/tui/tui-types.ts`
- Modify: `src/tui/tui-state.ts`
- Modify: `src/tui/run-interactive-tui.ts`
- Modify: `src/tui/renderer-blessed/tui-runtime.ts`
- Modify: `src/tui/renderer-blessed/tui-app.ts`
- Modify: `tests/runtime/interactive-session.test.ts`
- Modify: `tests/runtime/session-manager.test.ts`
- Modify: `tests/tui/run-interactive-tui.test.ts`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

### Task 1: Add The Built-In Command Registry And Parser

**Files:**
- Create: `src/commands/command-types.ts`
- Create: `src/commands/builtin-commands.ts`
- Create: `src/commands/command-parser.ts`
- Test: `tests/commands/builtin-commands.test.ts`

- [x] **Step 1: Write the failing command registry and parser tests**
- [x] **Step 2: Run `node --experimental-strip-types --test tests/commands/builtin-commands.test.ts` and verify they fail**
- [x] **Step 3: Implement the minimal built-in command metadata and slash parser**
- [x] **Step 4: Re-run `node --experimental-strip-types --test tests/commands/builtin-commands.test.ts` and verify they pass**

### Task 2: Replace Hardcoded Interactive Slash Logic With Runtime Command Dispatch

**Files:**
- Create: `src/commands/command-executor.ts`
- Modify: `src/runtime/runtime-session.ts`
- Modify: `tests/runtime/interactive-session.test.ts`
- Modify: `tests/runtime/session-manager.test.ts`

- [x] **Step 1: Write failing runtime tests for built-in command dispatch**
- [x] **Step 2: Run the targeted runtime tests and verify they fail**
- [x] **Step 3: Implement command execution effects for `/help`, `/clear`, `/status`, `/branch`, and `/exit`**
- [x] **Step 4: Re-run the targeted runtime tests and verify they pass**

### Task 3: Add TUI Slash Suggestion State

**Files:**
- Modify: `src/tui/tui-types.ts`
- Modify: `src/tui/tui-state.ts`
- Modify: `src/tui/run-interactive-tui.ts`
- Modify: `tests/tui/run-interactive-tui.test.ts`

- [x] **Step 1: Write failing TUI state tests for slash suggestion visibility**
- [x] **Step 2: Run the targeted TUI tests and verify they fail**
- [x] **Step 3: Add the minimal renderer-agnostic command suggestion state**
- [x] **Step 4: Re-run the targeted TUI tests and verify they pass**

### Task 4: Render A Minimal Slash Palette Shell In The Blessed Renderer

**Files:**
- Modify: `src/tui/renderer-blessed/tui-runtime.ts`
- Modify: `src/tui/renderer-blessed/tui-app.ts`
- Modify: `tests/tui/renderer-blessed/tui-runtime.test.ts`

- [x] **Step 1: Write failing renderer tests for slash suggestion visibility**
- [x] **Step 2: Run the targeted renderer tests and verify they fail**
- [x] **Step 3: Render a minimal command suggestion shell without moving command semantics into the renderer**
- [x] **Step 4: Re-run the targeted renderer tests and verify they pass**

### Task 5: Verify End-To-End And Update Project Working Memory

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify: `plans/2026-03-24-command-surface-plan.md`

- [x] **Step 1: Run `npm test`**
- [x] **Step 2: Run `npm run check`**
- [x] **Step 3: Run `npm run build`**
- [x] **Step 4: Manually smoke test `beta` with slash commands in interactive mode**
- [x] **Step 5: Update working memory and mark completed items**

## Notes

- Command execution semantics must stay outside the renderer.
- Built-in command ids and display names should be distinct so aliases remain possible later.
- The first pass should prefer a stable registry and runtime dispatch over a visually rich palette.
- Do not invent fake command behaviors; only ship commands with real runtime effects in this pass.
