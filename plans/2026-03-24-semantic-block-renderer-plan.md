# Semantic Block Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `beta` timeline rendering from direct string cards to a semantic block rendering pipeline that supports user cards, richer assistant markdown, and execution transcript structure without leaking renderer concerns into runtime code.

**Architecture:** Keep `TimelineItem` as the renderer-external input boundary, introduce a renderer-agnostic block/view-model layer, and make the blessed renderer consume block trees instead of raw item-specific string logic. This pass should improve expressiveness without rewriting runtime semantics or overreaching into a full markdown/document engine.

**Tech Stack:** Node.js 22+, TypeScript, ESM, Node test runner, existing fullscreen TUI stack, `neo-blessed` isolated under `src/tui/renderer-blessed/*`

---

## File Map

- Create: `src/tui/block-model/block-types.ts`
- Create: `src/tui/block-model/text-tokens.ts`
- Create: `src/tui/view-model/markdown-blocks.ts`
- Create: `src/tui/view-model/timeline-blocks.ts`
- Create: `src/tui/renderer-blessed/block-layout.ts`
- Create: `src/tui/renderer-blessed/block-renderer.ts`
- Create: `tests/tui/view-model/markdown-blocks.test.ts`
- Create: `tests/tui/view-model/timeline-blocks.test.ts`
- Create: `tests/tui/renderer-blessed/block-renderer.test.ts`
- Modify: `src/tui/renderer-blessed/tui-theme.ts`
- Modify: `src/tui/renderer-blessed/tui-app.ts`
- Modify: `tests/tui/renderer-blessed/tui-theme.test.ts`
- Modify: `tests/tui/run-interactive-tui.test.ts`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

### Task 1: Freeze The Semantic Block Contracts And Markdown Subset

**Files:**
- Create: `src/tui/block-model/block-types.ts`
- Create: `src/tui/block-model/text-tokens.ts`
- Create: `src/tui/view-model/markdown-blocks.ts`
- Create: `tests/tui/view-model/markdown-blocks.test.ts`

- [x] **Step 1: Write failing markdown block tests for paragraphs, lists, quotes, fenced code blocks, and inline code**
- [x] **Step 2: Run `node --experimental-strip-types --test tests/tui/view-model/markdown-blocks.test.ts` and verify they fail**
- [x] **Step 3: Implement the minimal block and text-token contracts plus markdown block parsing**
- [x] **Step 4: Re-run `node --experimental-strip-types --test tests/tui/view-model/markdown-blocks.test.ts` and verify they pass**

### Task 2: Build Timeline Card View Models On Top Of The Block Contracts

**Files:**
- Create: `src/tui/view-model/timeline-blocks.ts`
- Create: `tests/tui/view-model/timeline-blocks.test.ts`

- [x] **Step 1: Write failing timeline block tests for welcome, user, assistant, system, and execution cards**
- [x] **Step 2: Run `node --experimental-strip-types --test tests/tui/view-model/timeline-blocks.test.ts` and verify they fail**
- [x] **Step 3: Implement renderer-agnostic timeline card builders that reuse the markdown block layer for assistant content**
- [x] **Step 4: Re-run `node --experimental-strip-types --test tests/tui/view-model/timeline-blocks.test.ts` and verify they pass**

### Task 3: Replace Direct Timeline String Rendering With A Blessed Block Renderer

**Files:**
- Create: `src/tui/renderer-blessed/block-layout.ts`
- Create: `src/tui/renderer-blessed/block-renderer.ts`
- Modify: `src/tui/renderer-blessed/tui-theme.ts`
- Modify: `src/tui/renderer-blessed/tui-app.ts`
- Create: `tests/tui/renderer-blessed/block-renderer.test.ts`
- Modify: `tests/tui/renderer-blessed/tui-theme.test.ts`

- [x] **Step 1: Write failing renderer tests for user-card styling, assistant markdown blocks, execution transcript rendering, and semantic token highlighting**
- [x] **Step 2: Run `node --experimental-strip-types --test tests/tui/renderer-blessed/block-renderer.test.ts tests/tui/renderer-blessed/tui-theme.test.ts` and verify they fail**
- [x] **Step 3: Implement the blessed block renderer and migrate `tui-app.ts` to render timeline content through the block/view-model pipeline**
- [x] **Step 4: Re-run `node --experimental-strip-types --test tests/tui/renderer-blessed/block-renderer.test.ts tests/tui/renderer-blessed/tui-theme.test.ts` and verify they pass**

### Task 4: Verify Integration And Preserve Existing Interaction Behavior

**Files:**
- Modify: `tests/tui/run-interactive-tui.test.ts`

- [x] **Step 1: Write failing integration tests that prove the interactive TUI still renders user/assistant/execution content through the new block path**
- [x] **Step 2: Run `node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts` and verify the new assertions fail**
- [x] **Step 3: Make the smallest compatibility fixes needed so slash palette behavior, timeline selection, and block rendering coexist cleanly**
- [x] **Step 4: Re-run `node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts` and verify they pass**

### Task 5: Run Full Verification And Update Working Memory

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify: `plans/2026-03-24-semantic-block-renderer-plan.md`

- [x] **Step 1: Run `npm test`**
- [x] **Step 2: Run `npm run check`**
- [x] **Step 3: Run `npm run build`**
- [x] **Step 4: Manually smoke test `beta` in fullscreen TUI with user input, assistant markdown, execution cards, and slash palette visibility**
  - NOTE: Fullscreen smoke covered startup, slash palette visibility on `/`, prompt submission rendering, assistant reply rendering, and markdown/list/inline-code rendering, plus clean exit with `Ctrl+D`. A fresh real-TTY smoke of `node dist/src/cli/entry.js \"/branch\"` showed the natural execution path end-to-end in fullscreen TUI: `System: branch: no-git` plus a visible collapsed `Execution: Read git branch · Details hidden` card, followed by clean exit with `Ctrl+D`.
- [x] **Step 5: Update working memory and mark completed items**

## Notes

- `TimelineItem` remains the renderer-external input contract in this pass.
- Keep markdown parsing intentionally partial; do not build a full document engine.
- Do not move runtime or command semantics into the renderer while introducing the block pipeline.
- Prefer small focused files. If `tui-theme.ts` starts carrying structural rendering logic again, move that logic into the new block-renderer files instead.
