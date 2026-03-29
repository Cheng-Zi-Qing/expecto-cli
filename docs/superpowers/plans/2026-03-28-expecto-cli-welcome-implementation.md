# Expecto CLI Welcome Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text startup welcome item with the approved `Expecto CLI` branded welcome card while preserving the sticky main-screen interaction model.

**Architecture:** Introduce a structured welcome payload in TUI state, transform it into a dedicated welcome view-model block, and render that block in both the terminal and blessed renderers. Wire real metadata for version, provider/model, and project path into the initial TUI state, while keeping welcome replacement semantics unchanged once real transcript items appear.

**Tech Stack:** Node.js 22+, TypeScript, Node test runner, sticky terminal renderer, blessed renderer, TUI state/view-model pipeline.

---

## File Map

- Modify: `src/tui/tui-types.ts`
- Modify: `src/tui/tui-state.ts`
- Modify: `src/tui/view-model/timeline-blocks.ts`
- Modify: `src/tui/view-model/tui-view-types.ts`
- Modify: `src/tui/run-interactive-tui.ts`
- Optional Create: `src/cli/package-metadata.ts`
- Optional Modify: `src/cli/entry.ts`
- Modify: `src/tui/renderer-terminal/transcript-renderer.ts`
- Modify: `src/tui/renderer-blessed/block-renderer.ts`
- Test: `tests/tui/tui-state.test.ts`
- Test: `tests/tui/view-model/timeline-blocks.test.ts`
- Test: `tests/tui/view-model/tui-view-model.test.ts`
- Test: `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- Test: `tests/tui/renderer-terminal/tui-app.test.ts`
- Test: `tests/tui/renderer-blessed/block-renderer.test.ts`
- Optional Test: `tests/tui/run-interactive-tui.test.ts`

## Task 1: Add A Structured Welcome Payload To TUI State

**Files:**
- Modify: `src/tui/tui-types.ts`
- Modify: `src/tui/tui-state.ts`
- Test: `tests/tui/tui-state.test.ts`

- [ ] **Step 1: Write failing state tests for the new welcome data**

```ts
test("createInitialTuiState seeds a structured Expecto CLI welcome payload", () => {
  // expect product name, version, greeting copy, model info, and path info
});

test("first real timeline item still replaces the initial welcome-only transcript", () => {
  // expect structured welcome item to disappear exactly like the current plain welcome item
});
```

- [ ] **Step 2: Run the focused state tests and verify they fail**

Run:
```bash
node --experimental-strip-types --test tests/tui/tui-state.test.ts
```

Expected:
- FAIL because `TimelineItem` does not yet carry structured welcome data

- [ ] **Step 3: Extend the state model with explicit welcome content**

Implementation notes:
- keep `kind: "welcome"` as the welcome discriminator
- add a dedicated welcome payload type rather than encoding columns inside `summary` or `body`
- include product name, version label, greeting strings, glyph rows, provider/model labels, path label, and right-column sections
- keep the existing welcome replacement behavior untouched

- [ ] **Step 4: Re-run the state tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test tests/tui/tui-state.test.ts
```

Expected:
- PASS with a structured initial welcome item and unchanged replacement semantics

- [ ] **Step 5: Commit the state model change**

```bash
git add src/tui/tui-types.ts src/tui/tui-state.ts tests/tui/tui-state.test.ts
git commit -m "feat: add structured welcome payload for tui"
```

## Task 2: Build A Dedicated Welcome View-Model Block

**Files:**
- Modify: `src/tui/view-model/timeline-blocks.ts`
- Modify: `src/tui/view-model/tui-view-types.ts`
- Test: `tests/tui/view-model/timeline-blocks.test.ts`
- Test: `tests/tui/view-model/tui-view-model.test.ts`

- [ ] **Step 1: Add failing view-model tests for welcome layout data**

```ts
test("welcome item builds a dedicated welcome panel block instead of a plain paragraph", () => {
  // expect left and right sections, not a default paragraph block
});

test("buildTuiViewModel preserves structured welcome content for renderers", () => {
  // expect transcript block metadata for title, glyph, meta rows, and utility sections
});
```

- [ ] **Step 2: Run the focused view-model tests and verify they fail**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/view-model/timeline-blocks.test.ts \
  tests/tui/view-model/tui-view-model.test.ts
```

Expected:
- FAIL because welcome is still flattened into a paragraph block

- [ ] **Step 3: Add a dedicated welcome block type**

Implementation notes:
- add a block type such as `welcome_panel`
- make the block explicit about title row, left identity section, and right utility sections
- keep assistant markdown and execution transcript behavior unchanged
- do not overload `paragraph` to carry structured layout data

- [ ] **Step 4: Re-run the view-model tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/view-model/timeline-blocks.test.ts \
  tests/tui/view-model/tui-view-model.test.ts
```

Expected:
- PASS with a dedicated welcome block flowing into the transcript view

- [ ] **Step 5: Commit the welcome view-model layer**

```bash
git add \
  src/tui/view-model/timeline-blocks.ts \
  src/tui/view-model/tui-view-types.ts \
  tests/tui/view-model/timeline-blocks.test.ts \
  tests/tui/view-model/tui-view-model.test.ts
git commit -m "feat: add structured welcome view model"
```

## Task 3: Wire Real Version And Path Metadata Into The Initial Welcome State

**Files:**
- Modify: `src/tui/run-interactive-tui.ts`
- Optional Create: `src/cli/package-metadata.ts`
- Optional Modify: `src/cli/entry.ts`
- Optional Test: `tests/tui/run-interactive-tui.test.ts`

- [ ] **Step 1: Add a failing integration test for welcome metadata wiring**

```ts
test("runInteractiveTui seeds welcome metadata with version label and project path", async () => {
  // expect the initial state to contain a path label richer than basename
});
```

- [ ] **Step 2: Run the focused integration test and verify it fails**

Run:
```bash
node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts
```

Expected:
- FAIL because only `projectLabel` basename and no version label are currently passed into TUI state

- [ ] **Step 3: Add a narrow metadata source and pass it into the welcome payload**

Implementation notes:
- prefer an explicit metadata helper over renderer-time file reads
- keep version lookup isolated from renderers
- derive a user-facing project path from `context.projectRoot`
- keep command-tip copy honest: do not ship `/init` unless that command exists

- [ ] **Step 4: Re-run the integration test and verify it passes**

Run:
```bash
node --experimental-strip-types --test tests/tui/run-interactive-tui.test.ts
```

Expected:
- PASS with stable welcome metadata inputs

- [ ] **Step 5: Commit the metadata wiring**

```bash
git add src/tui/run-interactive-tui.ts tests/tui/run-interactive-tui.test.ts
git add src/cli/entry.ts
# Add this only if the helper was created:
git add src/cli/package-metadata.ts
git commit -m "feat: wire expecto welcome metadata"
```

## Task 4: Render The Welcome Card In The Terminal Transcript Renderer

**Files:**
- Modify: `src/tui/renderer-terminal/transcript-renderer.ts`
- Modify: `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- Modify: `tests/tui/renderer-terminal/tui-app.test.ts`

- [ ] **Step 1: Add failing terminal renderer tests for the structured welcome card**

```ts
test("renderTranscript renders the Expecto CLI welcome card as a bordered startup panel", () => {
  // expect card title, greeting copy, mascot glyph, and utility column labels
});

test("createTerminalTuiApp shows the welcome card in sticky main-screen mode before real activity starts", async () => {
  // expect framed welcome output and framed footer to coexist
});
```

- [ ] **Step 2: Run the focused terminal tests and verify they fail**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/tui-app.test.ts
```

Expected:
- FAIL because the terminal renderer only knows how to render plain paragraph welcome content

- [ ] **Step 3: Implement terminal rendering for the welcome panel**

Implementation notes:
- render one outer frame for the full welcome card
- support two-column layout at normal widths and stacked fallback when needed
- preserve the badger glyph proportions and color intent
- keep width calculations Unicode-aware
- do not regress existing user, assistant, system, or execution rendering

- [ ] **Step 4: Re-run the terminal tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/tui-app.test.ts
```

Expected:
- PASS with branded welcome rendering and no regression to sticky footer behavior

- [ ] **Step 5: Commit the terminal welcome renderer**

```bash
git add \
  src/tui/renderer-terminal/transcript-renderer.ts \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/tui-app.test.ts
git commit -m "feat: render expecto welcome card in terminal tui"
```

## Task 5: Render The Same Welcome Card In The Blessed Renderer

**Files:**
- Modify: `src/tui/renderer-blessed/block-renderer.ts`
- Modify: `tests/tui/renderer-blessed/block-renderer.test.ts`

- [ ] **Step 1: Add failing blessed renderer tests for the welcome panel**

```ts
test("renderTimelineCardMarkup renders the structured Expecto CLI welcome card", () => {
  // expect the same title, greeting, mascot, and utility sections as the terminal path
});
```

- [ ] **Step 2: Run the focused blessed renderer test and verify it fails**

Run:
```bash
node --experimental-strip-types --test tests/tui/renderer-blessed/block-renderer.test.ts
```

Expected:
- FAIL because the blessed renderer also treats welcome as a plain paragraph card

- [ ] **Step 3: Implement blessed rendering for the dedicated welcome block**

Implementation notes:
- keep semantic parity with the terminal renderer
- use the existing blessed theme utilities for accent colors
- preserve the chosen mascot face shape and color zones
- avoid introducing a second incompatible welcome layout contract

- [ ] **Step 4: Re-run the blessed renderer test and verify it passes**

Run:
```bash
node --experimental-strip-types --test tests/tui/renderer-blessed/block-renderer.test.ts
```

Expected:
- PASS with welcome card parity on the blessed path

- [ ] **Step 5: Commit the blessed renderer support**

```bash
git add src/tui/renderer-blessed/block-renderer.ts tests/tui/renderer-blessed/block-renderer.test.ts
git commit -m "feat: render expecto welcome card in blessed tui"
```

## Task 6: Run Full Targeted Verification And Manual Startup Checks

**Files:**
- No new files
- Verify: `tests/tui/tui-state.test.ts`
- Verify: `tests/tui/view-model/timeline-blocks.test.ts`
- Verify: `tests/tui/view-model/tui-view-model.test.ts`
- Verify: `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- Verify: `tests/tui/renderer-terminal/tui-app.test.ts`
- Verify: `tests/tui/renderer-blessed/block-renderer.test.ts`
- Optional Verify: `tests/tui/run-interactive-tui.test.ts`

- [ ] **Step 1: Run the targeted welcome-related test suite**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/tui-state.test.ts \
  tests/tui/view-model/timeline-blocks.test.ts \
  tests/tui/view-model/tui-view-model.test.ts \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/tui-app.test.ts \
  tests/tui/renderer-blessed/block-renderer.test.ts \
  tests/tui/run-interactive-tui.test.ts
```

Expected:
- PASS

- [ ] **Step 2: Rebuild the project**

Run:
```bash
npm run build
```

Expected:
- PASS

- [ ] **Step 3: Manual startup verification**

Run:
```bash
beta
```

Check:
- startup stays on the main screen, not the alternate screen
- the first transcript item is the `Expecto CLI` welcome card
- the welcome card shows the approved badger glyph direction
- the footer remains sticky and framed
- entering a real command or prompt removes the welcome-only transcript state
- no shipped tip references nonexistent behavior

- [ ] **Step 4: Commit the finished welcome implementation**

```bash
git add \
  src/tui/tui-types.ts \
  src/tui/tui-state.ts \
  src/tui/view-model/timeline-blocks.ts \
  src/tui/view-model/tui-view-types.ts \
  src/tui/run-interactive-tui.ts \
  src/tui/renderer-terminal/transcript-renderer.ts \
  src/tui/renderer-blessed/block-renderer.ts \
  tests/tui/tui-state.test.ts \
  tests/tui/view-model/timeline-blocks.test.ts \
  tests/tui/view-model/tui-view-model.test.ts \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/tui-app.test.ts \
  tests/tui/renderer-blessed/block-renderer.test.ts \
  tests/tui/run-interactive-tui.test.ts
# Add these only if they were changed or created:
git add src/cli/entry.ts
git add src/cli/package-metadata.ts
git commit -m "feat: add expecto cli welcome screen"
```
