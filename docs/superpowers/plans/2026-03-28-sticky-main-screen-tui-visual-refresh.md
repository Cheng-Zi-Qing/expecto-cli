# Sticky Main-Screen TUI Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the sticky main-screen TUI's visual hierarchy using the locked design direction `A1 + K2 + U3 + P1` without changing its interaction behavior.

**Architecture:** Keep the current main-screen sticky interaction path, but reintroduce intentional visual structure at three renderer layers: semantic inline tokenization, transcript item chrome, and framed sticky footer chrome. Reuse existing terminal footer rendering patterns where possible, and keep all behavior changes scoped to presentation and token classification.

**Tech Stack:** Node.js 22+, TypeScript, Node test runner, existing terminal transcript/footer renderers, sticky-screen writer, shared text token model.

---

## File Map

- Modify: `src/tui/view-model/markdown-blocks.ts`
- Modify: `src/tui/block-model/text-tokens.ts` (only if the existing token set needs a minimal extension; prefer no change)
- Modify: `src/tui/renderer-terminal/transcript-renderer.ts`
- Modify: `src/tui/renderer-terminal/footer-renderer.ts` (only if the locked footer contract needs a narrow adjustment)
- Modify: `src/tui/sticky-screen/screen-writer.ts`
- Modify: `src/tui/sticky-screen/presentation-surface.ts`
- Test: `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- Test: `tests/tui/renderer-terminal/footer-renderer.test.ts`
- Test: `tests/tui/sticky-screen/screen-writer.test.ts`
- Test: `tests/tui/renderer-terminal/tui-app.test.ts`
- Optional Test: `tests/tui/view-model/markdown-blocks.test.ts`

## Task 1: Lock Down The Visual Contract With Failing Tests

**Files:**
- Modify: `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- Modify: `tests/tui/renderer-terminal/tui-app.test.ts`
- Modify: `tests/tui/sticky-screen/screen-writer.test.ts`
- Modify: `tests/tui/renderer-terminal/footer-renderer.test.ts`

- [ ] **Step 1: Add failing transcript chrome tests**

```ts
test("renderTranscript renders Submitted Input as a framed card while keeping Assistant rail-only", () => {
  // expect framed user card lines and non-boxed assistant rail lines
});

test("renderTranscript renders System and Execution with utility rails rather than framed cards", () => {
  // expect rail chrome and no framed utility card body
});
```

- [ ] **Step 2: Add failing sticky footer tests**

```ts
test("createTerminalTuiApp restores framed Composer and Status chrome in sticky mode", async () => {
  // expect footer output to include the Composer and Status frame lines
});
```

- [ ] **Step 3: Add failing screen-writer tests for framed footer redraw**

```ts
test("screen writer redraws sticky footer using framed footer lines instead of plain text rows", () => {
  // expect framed footer text and cursor placement based on footer render output
});
```

- [ ] **Step 4: Run the targeted tests and verify they fail for the intended reason**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/tui-app.test.ts \
  tests/tui/sticky-screen/screen-writer.test.ts \
  tests/tui/renderer-terminal/footer-renderer.test.ts
```

Expected:
- transcript tests fail because assistant/system/execution styling is still too plain
- sticky footer tests fail because the bottom region still lacks the restored visual contract

- [ ] **Step 5: Commit the red tests**

```bash
git add \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/tui-app.test.ts \
  tests/tui/sticky-screen/screen-writer.test.ts \
  tests/tui/renderer-terminal/footer-renderer.test.ts
git commit -m "test: lock sticky tui visual contract"
```

## Task 2: Implement Semantic Inline Tokenization For K2 Highlighting

**Files:**
- Modify: `src/tui/view-model/markdown-blocks.ts`
- Optional Modify: `src/tui/block-model/text-tokens.ts`
- Optional Test: `tests/tui/view-model/markdown-blocks.test.ts`

- [ ] **Step 1: Add failing tokenization tests for command, path, shortcut, and status**

```ts
test("tokenizeInline classifies slash commands, file paths, shortcuts, and statuses with K2 semantics", () => {
  // expect a mixed token stream, not a single default token
});
```

- [ ] **Step 2: Run the focused tokenization test and verify it fails**

Run:
```bash
node --experimental-strip-types --test tests/tui/view-model/markdown-blocks.test.ts
```

Expected:
- FAIL because the current tokenizer only emits `default` and `inline_code`

- [ ] **Step 3: Implement a conservative semantic tokenizer**

Implementation notes:
- Keep `inline_code` highest priority
- Only emit `command`, `path`, `shortcut`, and `status` on high-confidence matches
- Include bare filenames like `README.md`
- Do not introduce freeform noun highlighting
- Keep code-block rendering unchanged

- [ ] **Step 4: Re-run the tokenization tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test tests/tui/view-model/markdown-blocks.test.ts
```

Expected:
- PASS with stable token streams for the approved semantic classes

- [ ] **Step 5: Commit the tokenization layer**

```bash
git add src/tui/view-model/markdown-blocks.ts tests/tui/view-model/markdown-blocks.test.ts
git commit -m "feat: add semantic inline tokenization for terminal tui"
```

## Task 3: Restore Transcript Chrome For A1 And U3

**Files:**
- Modify: `src/tui/renderer-terminal/transcript-renderer.ts`
- Modify: `tests/tui/renderer-terminal/transcript-renderer.test.ts`

- [ ] **Step 1: Implement framed Submitted Input rendering**

Implementation notes:
- `Submitted Input` remains a full framed card
- preserve the existing “show user prompt once” rule
- preserve wrapping and append-only transcript diff behavior

- [ ] **Step 2: Implement rail-only rendering for Assistant, System, and Execution**

Implementation notes:
- Assistant uses blue label + left rail only
- System and Execution use gold rails with lighter utility emphasis
- collapsed execution items still show their utility hint cleanly
- avoid reintroducing filled output cards

- [ ] **Step 3: Re-run the transcript tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test tests/tui/renderer-terminal/transcript-renderer.test.ts
```

Expected:
- PASS with framed user cards and rail-based non-user transcript items

- [ ] **Step 4: Commit the transcript renderer changes**

```bash
git add src/tui/renderer-terminal/transcript-renderer.ts tests/tui/renderer-terminal/transcript-renderer.test.ts
git commit -m "feat: restore sticky transcript chrome"
```

## Task 4: Restore Framed Sticky Footer Chrome

**Files:**
- Modify: `src/tui/sticky-screen/screen-writer.ts`
- Modify: `src/tui/sticky-screen/presentation-surface.ts`
- Modify: `src/tui/renderer-terminal/footer-renderer.ts` (only if minimally required)
- Modify: `tests/tui/sticky-screen/screen-writer.test.ts`
- Modify: `tests/tui/renderer-terminal/tui-app.test.ts`
- Modify: `tests/tui/renderer-terminal/footer-renderer.test.ts` (only if contract changes)

- [ ] **Step 1: Reuse the framed footer renderer from sticky mode**

Implementation notes:
- make `screen-writer` render the bottom region through `renderFooter()`, or a minimal shared equivalent
- keep footer cursor placement correct after wrapping
- preserve sticky scroll-region behavior and current input semantics

- [ ] **Step 2: Ensure footer status text still reflects runtime state**

Implementation notes:
- footer must show `Done`, `Thinking`, `Running tool`, `Interrupted`, etc.
- active request state still controls lock and placeholder semantics

- [ ] **Step 3: Re-run the footer and sticky app tests and verify they pass**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/renderer-terminal/footer-renderer.test.ts \
  tests/tui/sticky-screen/screen-writer.test.ts \
  tests/tui/renderer-terminal/tui-app.test.ts
```

Expected:
- PASS with restored Composer/Status frame chrome and correct cursor placement

- [ ] **Step 4: Commit the footer restoration**

```bash
git add \
  src/tui/sticky-screen/screen-writer.ts \
  src/tui/sticky-screen/presentation-surface.ts \
  src/tui/renderer-terminal/footer-renderer.ts \
  tests/tui/sticky-screen/screen-writer.test.ts \
  tests/tui/renderer-terminal/tui-app.test.ts \
  tests/tui/renderer-terminal/footer-renderer.test.ts
git commit -m "feat: restore sticky footer chrome"
```

## Task 5: Run Full Targeted Verification For The Main-Screen Path

**Files:**
- No new files
- Verify: `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- Verify: `tests/tui/renderer-terminal/footer-renderer.test.ts`
- Verify: `tests/tui/sticky-screen/screen-writer.test.ts`
- Verify: `tests/tui/sticky-screen/interactive-console-app.test.ts`
- Verify: `tests/tui/renderer-terminal/tui-app.test.ts`
- Verify: `tests/tui/run-interactive-tui.test.ts`

- [ ] **Step 1: Run the full targeted terminal TUI suite**

Run:
```bash
node --experimental-strip-types --test \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/footer-renderer.test.ts \
  tests/tui/sticky-screen/screen-writer.test.ts \
  tests/tui/sticky-screen/interactive-console-app.test.ts \
  tests/tui/renderer-terminal/tui-app.test.ts \
  tests/tui/run-interactive-tui.test.ts
```

Expected:
- PASS

- [ ] **Step 2: Rebuild the root dist entrypoint**

Run:
```bash
npm run build
```

Expected:
- PASS

- [ ] **Step 3: Manual verification checklist**

Run:
```bash
beta
```

Check:
- main-screen behavior still holds
- `/branch` appends transcript above the sticky footer
- submitted input is framed
- assistant output is rail-only
- system/execution items use gold rails
- footer shows framed Composer and Status
- semantic highlighting appears for commands, paths, inline code, shortcuts, and statuses

- [ ] **Step 4: Commit the final visual refresh**

```bash
git add \
  src/tui/view-model/markdown-blocks.ts \
  src/tui/renderer-terminal/transcript-renderer.ts \
  src/tui/sticky-screen/screen-writer.ts \
  src/tui/sticky-screen/presentation-surface.ts \
  tests/tui/view-model/markdown-blocks.test.ts \
  tests/tui/renderer-terminal/transcript-renderer.test.ts \
  tests/tui/renderer-terminal/footer-renderer.test.ts \
  tests/tui/sticky-screen/screen-writer.test.ts \
  tests/tui/renderer-terminal/tui-app.test.ts
git commit -m "feat: restore sticky main-screen tui visual hierarchy"
```
