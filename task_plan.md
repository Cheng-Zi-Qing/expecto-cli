# Task Plan

## Goal

Prepare and execute `plans/2026-03-24-semantic-block-renderer-plan.md` so `beta` gains a renderer-agnostic semantic block pipeline for timeline rendering, enabling user cards, richer assistant markdown, and structured execution rendering without leaking display logic into runtime code.

## Current Phase

1. `completed` Freeze the semantic block renderer spec
2. `completed` Write the semantic block renderer implementation plan
3. `completed` Freeze semantic block contracts and markdown subset
4. `completed` Build timeline card view models
5. `completed` Replace direct timeline string rendering with a blessed block renderer
6. `completed` Verify integration and preserve existing interaction behavior
7. `completed` Run full regression and update working memory

## Key Decisions In Effect

- `neo-blessed` remains isolated under `src/tui/renderer-blessed/*`.
- `TimelineItem` remains the renderer-external input boundary for this pass.
- A renderer-agnostic block/view-model layer sits between timeline state and blessed markup generation.
- Markdown parsing remains intentionally partial:
  - paragraph
  - list
  - quote
  - fenced code block
  - inline code
- Future renderer richness should build on semantic blocks, not on more `TimelineItem -> final markup` special cases.

## Completed Work

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

## Verification Completed

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

- Start the next post-renderer track:
  - either lift execution items from `summary/body` strings to structured runtime events for future tool runtime work
  - or continue with the next approved TUI/product track now that semantic block rendering is closed end-to-end

## Risks / Constraints

- Interaction regressions are still possible in real TTY sessions even after Task 4 integration checks (especially around slash palette behavior and focus/selection handling).
- The current execution-item seam is intentionally minimal (`summary` + optional `body`). Future tool runtime work will likely need a more structured event shape.
- The markdown parser must stay intentionally partial. A rushed attempt at full CommonMark support would expand scope and destabilize the TUI layer.
- User card styling should stay in the same visual family as the composer without turning into chat-bubble UI.
- Fence handling was the main hot spot in Task 1; future changes to markdown parsing should preserve the current regression coverage rather than re-opening fence edge-case bugs.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Initial markdown parser changes passed the targeted tests but failed `tsc --noEmit` | 1 | Returned Task 1 to the implementer and fixed strict typing before proceeding to review |
| Spec and quality reviewers found multiple fence-edge bugs after the first green run | 3 | Added focused regression tests and iterated on `parseCodeBlock`/paragraph fallback until source-preservation behavior matched the intended narrow subset |
