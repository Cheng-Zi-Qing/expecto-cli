# Fullscreen TUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `beta` enter a fullscreen Claude-like TUI by default for interactive sessions while keeping `beta -p` as the plain one-shot path.

**Architecture:** Keep runtime/provider logic renderer-agnostic. Add a TUI state + view-model layer plus a `renderer-blessed` adapter. Interactive TUI sessions should still run through the existing runtime/session flow by using renderer-neutral session events and a queued interactive input bridge.

**Tech Stack:** Node.js 22+, TypeScript, ESM, `neo-blessed`, existing runtime/provider layer, Node test runner

---

## File Map

- Create: `specs/v1-tui-architecture.md`
- Modify: `package.json`
- Modify: `README.md`
- Create: `src/tui/tui-types.ts`
- Create: `src/tui/tui-state.ts`
- Create: `src/tui/context-metrics.ts`
- Create: `src/tui/queued-interactive-input.ts`
- Create: `src/tui/run-interactive-tui.ts`
- Create: `src/tui/renderer-blessed/tui-app.ts`
- Modify: `src/runtime/runtime-session.ts`
- Modify: `src/runtime/session-manager.ts`
- Modify: `src/cli/entry.ts`
- Modify: `src/providers/provider-types.ts`
- Modify: `src/providers/provider-runner.ts`
- Modify: `src/providers/anthropic-provider.ts`
- Modify: `src/providers/openai-provider.ts`
- Test: `tests/tui/tui-state.test.ts`
- Test: `tests/tui/run-interactive-tui.test.ts`
- Test: `tests/runtime/interactive-session.test.ts`
- Test: `tests/cli/entry.test.ts`
- Test: `tests/providers/http-provider.test.ts`

### Task 1: Add Renderer-Agnostic TUI State And Context Metrics

**Files:**

- Create: `src/tui/tui-types.ts`
- Create: `src/tui/tui-state.ts`
- Create: `src/tui/context-metrics.ts`
- Test: `tests/tui/tui-state.test.ts`

- [x] **Step 1: Write the failing tests for welcome state, focus switching, inspector toggling, and context metric derivation**
- [x] **Step 2: Run `node --experimental-strip-types --test tests/tui/tui-state.test.ts` and verify those tests fail for missing modules/behavior**
- [x] **Step 3: Implement the minimal TUI state contracts and context metrics helpers without importing any renderer library**
- [x] **Step 4: Run `node --experimental-strip-types --test tests/tui/tui-state.test.ts` and verify they pass**

### Task 2: Add Runtime-Neutral Session Events And Interrupt Plumbing

**Files:**

- Modify: `src/runtime/runtime-session.ts`
- Modify: `src/runtime/session-manager.ts`
- Modify: `src/providers/provider-types.ts`
- Modify: `src/providers/provider-runner.ts`
- Modify: `src/providers/anthropic-provider.ts`
- Modify: `src/providers/openai-provider.ts`
- Test: `tests/runtime/interactive-session.test.ts`
- Test: `tests/providers/http-provider.test.ts`

- [x] **Step 1: Write failing tests for runtime session event callbacks and provider abort-signal forwarding**
- [x] **Step 2: Run targeted runtime/provider tests and verify they fail for the expected missing event or signal behavior**
- [x] **Step 3: Implement neutral session events plus provider request signal forwarding**
- [x] **Step 4: Run targeted tests and verify they pass**

### Task 3: Add Queued Interactive Input Bridge And TUI Shell Adapter

**Files:**

- Create: `src/tui/queued-interactive-input.ts`
- Create: `src/tui/run-interactive-tui.ts`
- Create: `src/tui/renderer-blessed/tui-app.ts`
- Test: `tests/tui/run-interactive-tui.test.ts`

- [x] **Step 1: Write failing tests for queued prompt submission, system/assistant card projection, and Inspector toggle actions**
- [x] **Step 2: Run `node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts` and verify it fails**
- [x] **Step 3: Implement the minimal queued input bridge and a `neo-blessed` renderer adapter that stays confined to `src/tui/renderer-blessed/*`**
- [x] **Step 4: Run `node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts` and verify it passes**

### Task 4: Wire `beta` Interactive Mode To Fullscreen TUI

**Files:**

- Modify: `src/cli/entry.ts`
- Modify: `README.md`
- Modify: `package.json`
- Test: `tests/cli/entry.test.ts`

- [x] **Step 1: Write failing CLI tests for interactive TTY sessions selecting TUI while `-p` remains plain**
- [x] **Step 2: Run `node --experimental-strip-types --test tests/cli/entry.test.ts` and verify the new TUI-selection tests fail**
- [x] **Step 3: Implement CLI selection logic, install the renderer dependency, and keep non-TTY/test execution on the existing plain path**
- [x] **Step 4: Run `node --experimental-strip-types --test tests/cli/entry.test.ts` and verify they pass**

### Task 5: Verify End-To-End And Document The First Slice

**Files:**

- Modify: `README.md`
- Modify: `plans/2026-03-23-fullscreen-tui-plan.md`

- [x] **Step 1: Run `npm test`**
- [x] **Step 2: Run `npm run check`**
- [x] **Step 3: Run `npm run build`**
- [x] **Step 4: Manually smoke test `beta` in an interactive terminal**
- [x] **Step 5: Mark completed items in this plan**

## Notes

- Do not import `neo-blessed` outside `src/tui/renderer-blessed/*`.
- Keep `beta -p` on the existing non-TUI path.
- Keep slash command semantics in runtime, not in the renderer.
- Context percentage may be approximate in the first cut.
- Streaming can remain block-based in the first vertical slice if the TUI event model stays compatible with future token streaming.
