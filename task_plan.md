# Task Plan

## Goal

Complete `plans/2026-03-27-cli-routing-and-stream-presenter-plan.md` so `beta` uses the approved `--tui` / `--native` routing contract, enforces the non-TTY guard and stdin pipeline semantics, and streams native output through a real presenter path instead of the retired terminal renderer entry route.

## Current Phase

1. `completed` Split raw CLI parsing from route resolution
2. `completed` Land the pure route resolver and fail-fast non-TTY guard
3. `completed` Add pure stdin pipeline helpers for `stdin + prompt` and `stdin only`
4. `completed` Introduce `StreamPresenter` and `runNativeSession(...)`
5. `completed` Rewire `entry.ts`, migrate docs/tests, and lock deprecation behavior
6. `completed` Run focused CLI verification, post-review hardening, full regression, typecheck, and build

## Key Decisions In Effect

- `specs/2026-03-26-cli-interaction-contract.md` is the active source of truth for interaction behavior.
- This completed pass intentionally covered only the entry/native path:
  - raw CLI parsing vs route resolution
  - non-TTY guard enforcement
  - stdin pipeline assembly
  - native stream presenter wiring
  - deprecation shims for `-p/--print` and `BETA_TUI_RENDERER=terminal`
- `neo-blessed` remains the only fullscreen renderer exposed by the entrypoint.
- `renderer-terminal` stays out of entry routing; native one-shot and REPL output now flow through `src/cli/stream-presenter.ts`.
- `-p/--print` remains parseable but deprecated and warning-only.
- `BETA_TUI_RENDERER=terminal` remains warning-only and no longer changes routing.
- `--continue` / `--resume` remain stable legacy routes and must not consume stdin pipeline input before routing.
- Whole-stdin assembly remains the accepted contract for `stdin + prompt` and `stdin only` in this pass.

## Completed Work

- Completed `plans/2026-03-27-cli-routing-and-stream-presenter-plan.md`:
  - split parser intent from runtime bootstrap commands in:
    - `src/cli/arg-parser.ts`
    - `tests/cli/arg-parser.test.ts`
  - added pure route resolution and non-TTY guard coverage in:
    - `src/cli/route-resolution.ts`
    - `tests/cli/route-resolution.test.ts`
  - added stdin pipeline helpers in:
    - `src/cli/stdin-pipeline.ts`
    - `tests/cli/stdin-pipeline.test.ts`
  - added native presenter/runner plumbing in:
    - `src/cli/stream-presenter.ts`
    - `src/cli/run-native-session.ts`
    - `tests/cli/stream-presenter.test.ts`
    - `tests/cli/run-native-session.test.ts`
  - rewired `src/cli/entry.ts` around parsed args + resolved routes + pipeline assembly
  - migrated CLI docs/tests to the new contract in:
    - `README.md`
    - `tests/cli/entry.test.ts`
    - `tests/cli/entry-terminal-renderer.test.ts`
    - `tests/cli/install-metadata.test.ts`
  - fixed a Task 5 regression where `--continue` / `--resume` had begun consuming non-TTY stdin before routing
  - ran Task 5 spec review and code-quality review with in-scope follow-up fixes
  - completed final post-review hardening for:
    - request-scoped turn tracking in `src/tui/run-interactive-tui.ts` so a second prompt works after `tool_calls` continuation
    - provider-env suppression in `src/cli/entry.ts` so incomplete env is ignored only for legacy `--continue` / `--resume`
    - request-level native errors in:
      - `src/cli/stream-presenter.ts`
      - `src/cli/run-native-session.ts`
      - `src/cli/entry.ts`
    - stderr routing now rejects non-REPL native requests cleanly and avoids duplicate direct-execution error printing
  - cleaned accidental Task 5 spillover from the main worktree so the isolated worktree remains the only source of truth for these entry changes
- Wrote the terminal-native transcript follow-up plan:
  - `plans/2026-03-25-terminal-native-transcript-plan.md`
- Completed Task 1 from `plans/2026-03-25-terminal-native-transcript-plan.md`:
  - replaced alternate-screen writer primitives with:
    - `clearScreen()`
    - `setScrollRegion(top, bottom)`
    - `resetScrollRegion()`
  - updated `createTerminalSession(...)` so terminal sessions only manage:
    - raw mode
    - cursor visibility
    - scroll-region cleanup
  - locked the new behavior in:
    - `tests/tui/renderer-terminal/ansi-writer.test.ts`
    - `tests/tui/renderer-terminal/terminal-session.test.ts`
- Completed Task 2 from `plans/2026-03-25-terminal-native-transcript-plan.md`:
  - added full transcript rendering in `src/tui/renderer-terminal/transcript-renderer.ts`
  - added append-vs-replay diffing so terminal updates can avoid repainting earlier history on normal growth
  - aligned user-card transcript headers so submitted input text is not duplicated in terminal output
  - locked the behavior in `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- Completed Task 3 from `plans/2026-03-25-terminal-native-transcript-plan.md`:
  - rewrote `src/tui/renderer-terminal/tui-app.ts` around a scroll-region layout in the main terminal buffer
  - introduced framed footer metadata in `src/tui/renderer-terminal/footer-renderer.ts` for stable composer cursor placement
  - extended `src/tui/renderer-terminal/input-driver.ts` with timeline/composer focus semantics for:
    - `Esc`
    - arrow keys
    - page up/down
    - `i`
    - `Enter`
  - updated `tests/tui/renderer-terminal/tui-app.test.ts` to lock:
    - no alternate-screen entry
    - scroll-region reservation
    - append-only transcript updates
- Completed Task 4 from `plans/2026-03-25-terminal-native-transcript-plan.md`:
  - ran targeted terminal renderer verification
  - ran full regression, typecheck, and build verification
  - completed real TTY smoke for terminal-native transcript behavior
  - resumed the task on 2026-03-26, found an unintended CLI regression where fullscreen default renderer selection had been flipped to `terminal`, then restored the intended explicit-selector behavior in:
    - `src/cli/entry.ts`
    - `tests/cli/entry-terminal-renderer.test.ts`
  - continued the repair on 2026-03-26 and fixed a terminal paging bug where:
    - `PageUp` / `PageDown` were parsed in `src/tui/renderer-terminal/input-driver.ts`
    - but `src/tui/renderer-terminal/tui-app.ts` did not wire them to actual timeline paging behavior
  - added a renderer-local paging regression test in:
    - `tests/tui/renderer-terminal/tui-app.test.ts`
  - restored real terminal page navigation by adding renderer-local page target calculation in:
    - `src/tui/renderer-terminal/tui-app.ts`
- Historical completed track retained from the previous pass:
- Wrote the semantic block renderer spec:
  - `specs/2026-03-24-semantic-block-renderer.md`
- Wrote the semantic block renderer implementation plan:
  - `plans/2026-03-24-semantic-block-renderer-plan.md`
- Chosen scope for the first renderer pass:
  - user card
  - assistant markdown blocks
  - system/status blocks
  - execution transcript blocks
  - semantic inline token highlighting
- Completed Task 1 from `plans/2026-03-24-semantic-block-renderer-plan.md`:
  - added renderer-agnostic block contracts in `src/tui/block-model/block-types.ts`
  - added text token contracts in `src/tui/block-model/text-tokens.ts`
  - added a narrow markdown parser in `src/tui/view-model/markdown-blocks.ts`
  - added targeted markdown subset tests in `tests/tui/view-model/markdown-blocks.test.ts`
  - locked the subset with regression coverage for:
    - ordered lists
    - interior blank lines in fenced code
    - trailing blank line preservation in fenced code
    - malformed unclosed fences preserving literal source
    - fence-like literal lines inside code blocks
- Completed Task 2 from `plans/2026-03-24-semantic-block-renderer-plan.md`:
  - added timeline-to-block view model builders in `src/tui/view-model/timeline-blocks.ts`
  - added regression tests in `tests/tui/view-model/timeline-blocks.test.ts`
  - passed a fresh spec review: no blocking Task 2 deviations from `specs/2026-03-24-semantic-block-renderer.md`
  - applied follow-up quality fixes from review:
    - empty-string / whitespace-only body fallback now prefers `summary` for welcome/user/system/assistant when the summary has usable text
    - execution transcript blocks normalize CRLF and ignore a trailing terminal newline without losing meaningful interior blank lines
  - verification:
    - `node --experimental-strip-types --test tests/tui/view-model/timeline-blocks.test.ts` (14/14)
    - `npm run check`
- Completed Task 3 from `plans/2026-03-24-semantic-block-renderer-plan.md`:
  - passed a fresh spec review: no blocking Task 3 deviations from `specs/2026-03-24-semantic-block-renderer.md`
  - follow-up quality issues found and fixed:
    - width-aware line accounting existed but was not wired into the live TUI until `resolveTimelineWrapWidth(...)` + `renderTimelineItems(...)` integration in `src/tui/renderer-blessed/tui-app.ts`
    - renderer surface was tightened to a single public raw-timeline entry point
    - removed dead `showCursor` parameter from `renderComposerMarkup`
    - dynamic inspector/status values are now escaped before tagged blessed rendering
  - tests updated/added to cover:
    - block renderer layout and wrap-width behavior
    - renderer API surface
    - dynamic brace escaping in `tests/tui/renderer-blessed/tui-app.test.ts`
  - verification:
    - `node --experimental-strip-types --test tests/tui/renderer-blessed/tui-app.test.ts tests/tui/renderer-blessed/block-renderer.test.ts tests/tui/renderer-blessed/tui-theme.test.ts tests/tui/run-interactive-tui.test.ts` (19/19)
    - `npm run check`
- Completed Task 4 from `plans/2026-03-24-semantic-block-renderer-plan.md`:
  - passed spec review and code quality review for the Task 4 integration changes
  - updated `tests/tui/run-interactive-tui.test.ts` so the fake interactive app renders each `TuiState` through the semantic block path and captures `RenderedTimelineLayout` (including selected-line assertions for rendered selection)
  - fresh verification (renderer integration area):
    - `node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts` (4/4)
    - `npm run check`
- Completed Task 5 from `plans/2026-03-24-semantic-block-renderer-plan.md`:
  - automated verification completed successfully:
    - `npm test` (148/148)
    - `npm run check`
    - `npm run build`
  - runtime now has a natural execution-item emission path:
    - `/branch` emits a renderer-neutral execution item in addition to the existing `branch: ...` system line
    - `runInteractiveTui()` maps that hook to `append_execution_item`, so fullscreen TUI sessions can render a real execution card without test-only injection
    - built-in slash dispatch now goes through a shared `processInput()` path for:
      - interactive read-loop input
      - interactive `initialPrompt`
      - one-shot `print` prompt
  - targeted verification completed successfully:
    - `node --experimental-strip-types --test tests/runtime/session-manager.test.ts`
    - `node --experimental-strip-types --test tests/runtime/interactive-session.test.ts`
    - `node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts` (5/5)
  - manual fullscreen TUI smoke completed successfully for:
    - startup into fullscreen beta TUI from dist build
    - slash palette visibility on `/`
    - prompt submission rendering as Submitted Input
    - assistant reply rendering in fullscreen TUI
    - assistant markdown/list + inline code rendering in fullscreen TUI
    - natural execution-card visibility via `node dist/src/cli/entry.js "/branch"`:
      - `System: branch: no-git`
      - collapsed `Execution: Read git branch · Details hidden`
    - clean exit with Ctrl+D
- Completed `plans/2026-03-26-interaction-runtime-foundation-plan.md`:
  - landed the typed presenter-facing interaction event schema in `src/contracts/interaction-event-schema.ts`
  - moved runtime/TUI integration onto request-scoped interaction envelopes, request-ledger locking, and execution transcript buffering
  - hardened the Task 5 loop path so malformed assistant step payloads are normalized or rejected before event emission
  - removed stale failed prompts from conversation state when `AGENT_LOOP_LIMIT_EXCEEDED` terminates a request
  - completed fresh plan verification:
    - `node --experimental-strip-types --test tests/contracts/interaction-event-schema.test.ts tests/runtime/session-manager.test.ts tests/runtime/interactive-session.test.ts tests/tui/request-ledger.test.ts tests/tui/execution-transcript-buffer.test.ts tests/tui/tui-state.test.ts tests/tui/run-interactive-tui.test.ts` (80/80)
    - `npm test` (234/234)
    - `npm run check`
    - `npm run build`

## Verification Completed

- final post-review targeted regression:
  - `node --experimental-strip-types --test tests/cli/entry.test.ts tests/cli/stream-presenter.test.ts tests/cli/run-native-session.test.ts tests/tui/run-interactive-tui.test.ts tests/runtime/session-manager.test.ts` (55/55)
- final full verification:
  - `npm test` (273/273)
  - `npm run check`
  - `npm run build`
- `node --experimental-strip-types --test tests/cli/arg-parser.test.ts tests/cli/route-resolution.test.ts tests/cli/stdin-pipeline.test.ts tests/cli/stream-presenter.test.ts tests/cli/run-native-session.test.ts tests/cli/entry.test.ts tests/cli/entry-terminal-renderer.test.ts tests/cli/install-metadata.test.ts` (58/58)
- `npm test` (268/268)
- `npm run check`
- `npm run build`
- `node --experimental-strip-types --test tests/tui/renderer-terminal/ansi-writer.test.ts tests/tui/renderer-terminal/terminal-session.test.ts tests/tui/renderer-terminal/transcript-renderer.test.ts tests/tui/renderer-terminal/tui-app.test.ts` (16/16)
- `node --experimental-strip-types --test tests/cli/entry-terminal-renderer.test.ts`:
  - red: default fullscreen renderer unexpectedly resolved to `terminal`
  - green: default fullscreen renderer restored to `blessed`; explicit env override to `terminal` still works
- `node --experimental-strip-types --test tests/tui/renderer-terminal/ansi-writer.test.ts tests/tui/renderer-terminal/footer-renderer.test.ts tests/tui/renderer-terminal/terminal-session.test.ts tests/tui/renderer-terminal/transcript-renderer.test.ts tests/tui/renderer-terminal/tui-app.test.ts tests/tui/run-interactive-tui.test.ts` (26/26)
- `npm test` (178/178)
- `npm run check`
- `npm run build`
- Real TTY smoke:
  - `stty rows 12 cols 80 && BETA_TUI_RENDERER=terminal node --experimental-strip-types src/cli/entry.ts`
  - observed:
    - startup stays on main screen (`?1049h` absent)
    - transcript reserves a scroll region above the footer
    - `/help` appends through transcript output while footer stays fixed
    - exit restores cursor and resets the scroll region with `Ctrl+D`
- Design approval completed in-session for:
  - architecture boundary
  - block types and file decomposition
  - data flow and test strategy
- `node --experimental-strip-types --test tests/tui/view-model/markdown-blocks.test.ts`
- `node --experimental-strip-types --test tests/tui/view-model/timeline-blocks.test.ts` (14/14)
- `node --experimental-strip-types --test tests/tui/renderer-blessed/tui-app.test.ts tests/tui/renderer-blessed/block-renderer.test.ts tests/tui/renderer-blessed/tui-theme.test.ts tests/tui/run-interactive-tui.test.ts` (19/19)
- `node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts` (4/4)
- `node --experimental-strip-types --test tests/runtime/session-manager.test.ts`
- `node --experimental-strip-types --test tests/runtime/interactive-session.test.ts`
- `node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts` (5/5)
- `npm test` (148/148)
- `npm run check`
- `npm run build`

## Suggested Next Task

- Start the next explicitly deferred interaction track rather than expanding this foundation plan in place.
- The highest-value follow-up options are:
  - SQLite-backed command history and draft persistence with the recovery rules already frozen in `specs/2026-03-26-cli-interaction-contract.md`
  - follow-up native-path hardening only if explicitly desired:
    - stdin size limits / backpressure policy
    - direct-execution edge-case polish

## Risks / Constraints

- Real-TTY behavior can still diverge across terminals that implement scroll regions or resize events differently.
- `renderer-terminal` now has intentionally different product constraints from `renderer-blessed`; future changes should not silently flip the default renderer again.
- Append-only transcript optimization is correct only when previous lines are a strict prefix of the next render; selection-driven or resize-driven reflow still requires replay.
- The semantic block markdown subset must remain intentionally partial. Expanding it casually would destabilize both renderers.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Fullscreen default renderer selection was accidentally flipped to `terminal` during the terminal transcript follow-up | 1 | Restored explicit selection logic so only `BETA_TUI_RENDERER=terminal` opts into the terminal renderer; default fullscreen path remains `blessed` |
| `PageUp` / `PageDown` were parsed for the terminal renderer but never connected to actual timeline paging | 1 | Added a failing terminal app regression test, then wired renderer-local page movement in `src/tui/renderer-terminal/tui-app.ts` |
| Initial markdown parser changes passed the targeted tests but failed `tsc --noEmit` | 1 | Returned Task 1 to the implementer and fixed strict typing before proceeding to review |
| Spec and quality reviewers found multiple fence-edge bugs after the first green run | 3 | Added focused regression tests and iterated on `parseCodeBlock`/paragraph fallback until source-preservation behavior matched the intended narrow subset |
