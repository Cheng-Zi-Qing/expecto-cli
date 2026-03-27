# Terminal-Native Transcript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the terminal renderer's fake viewport timeline with a terminal-native transcript that appends into the main screen buffer while keeping the footer fixed.

**Architecture:** Keep `runInteractiveTui()` and the renderer-neutral view model intact, but change `renderer-terminal` from whole-screen replay in alternate screen mode to a scroll-region-based layout in the normal terminal buffer. Transcript output should append incrementally; the footer remains the only long-lived fixed region.

**Tech Stack:** Node.js 22, TypeScript, ANSI terminal control sequences, existing `node:test` suite, existing TUI runtime/state modules.

---

### Task 1: Add main-screen terminal session and scroll-region primitives

**Files:**
- Modify: `src/tui/renderer-terminal/ansi-writer.ts`
- Modify: `src/tui/renderer-terminal/terminal-session.ts`
- Test: `tests/tui/renderer-terminal/ansi-writer.test.ts`
- Test: `tests/tui/renderer-terminal/terminal-session.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
test("createAnsiWriter emits clear-screen and scroll-region sequences", () => {
  const writes: string[] = [];
  const writer = createAnsiWriter((chunk) => writes.push(chunk));

  writer.clearScreen();
  writer.setScrollRegion(1, 20);
  writer.resetScrollRegion();

  assert.deepEqual(writes, ["\u001b[2J", "\u001b[1;20r", "\u001b[r"]);
});

test("createTerminalSession stays on the main screen and only manages raw mode plus cursor", () => {
  const calls: string[] = [];
  const session = createTerminalSession({
    setRawMode: (enabled) => calls.push(`raw:${enabled}`),
    writer: createWriter(calls),
  });

  session.enter();
  session.exit();

  assert.deepEqual(calls, ["raw:true", "cursor:hide", "cursor:show", "raw:false"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/ansi-writer.test.ts tests/tui/renderer-terminal/terminal-session.test.ts`
Expected: FAIL because the writer/session still assume alternate screen only.

- [ ] **Step 3: Write minimal implementation**

```typescript
export type AnsiWriter = {
  clearScreen: () => void;
  setScrollRegion: (top: number, bottom: number) => void;
  resetScrollRegion: () => void;
  // existing cursor helpers remain
};

export function createTerminalSession(...) {
  return {
    enter: () => {
      options.setRawMode(true);
      options.writer.hideCursor();
    },
    exit: () => {
      options.writer.showCursor();
      options.setRawMode(false);
      options.writer.resetScrollRegion();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/ansi-writer.test.ts tests/tui/renderer-terminal/terminal-session.test.ts`
Expected: PASS

### Task 2: Introduce transcript append/replay helpers

**Files:**
- Modify: `src/tui/renderer-terminal/transcript-renderer.ts`
- Test: `tests/tui/renderer-terminal/transcript-renderer.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
test("renderTranscriptLines returns the full transcript instead of clipping to a viewport", () => {
  const lines = renderTranscriptLines(view.transcript, 80);
  assert.match(lines.join("\n"), /First card/);
  assert.match(lines.join("\n"), /Third card/);
});

test("diffTranscriptLines reports append-only updates separately from replay-required updates", () => {
  assert.deepEqual(
    diffTranscriptLines(["a", "b"], ["a", "b", "c"]),
    { mode: "append", lines: ["c"] },
  );
  assert.deepEqual(
    diffTranscriptLines(["a", "b"], ["a", "x"]),
    { mode: "replay", lines: ["a", "x"] },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/transcript-renderer.test.ts`
Expected: FAIL because the renderer only exposes viewport slicing.

- [ ] **Step 3: Write minimal implementation**

```typescript
export function renderTranscriptLines(view: TuiTranscriptView, width: number): string[] {
  return view.blocks.flatMap((card) => renderCard(card, width));
}

export function diffTranscriptLines(previous: string[], next: string[]) {
  if (next.length >= previous.length && previous.every((line, index) => next[index] === line)) {
    return { mode: "append" as const, lines: next.slice(previous.length) };
  }

  return { mode: "replay" as const, lines: next };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/transcript-renderer.test.ts`
Expected: PASS

### Task 3: Switch terminal renderer to scroll-region transcript output

**Files:**
- Modify: `src/tui/renderer-terminal/tui-app.ts`
- Modify: `src/tui/renderer-terminal/footer-renderer.ts`
- Modify: `src/tui/renderer-terminal/input-driver.ts`
- Test: `tests/tui/renderer-terminal/tui-app.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
test("createTerminalTuiApp appends new transcript lines without replaying prior history", async () => {
  await app.start();
  stdout.writes.length = 0;

  app.update(stateWithSecondAssistantMessage);

  assert.match(stdout.writes.join(""), /assistant: second output/);
  assert.doesNotMatch(stdout.writes.join(""), /assistant: inspect auth flow/);
});

test("createTerminalTuiApp reserves a scroll region above the footer", async () => {
  await app.start();
  assert.match(stdout.writes.join(""), /\u001b\[1;8r/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/tui-app.test.ts`
Expected: FAIL because the app still does whole-screen redraws from row 1.

- [ ] **Step 3: Write minimal implementation**

```typescript
// start:
// - clear the visible screen
// - reserve rows 1..transcriptBottom for transcript scrolling
// - render initial transcript by replaying all lines once
// - render footer in bottom rows

// update:
// - if width/height changed, full replay
// - else append only newly added transcript lines
// - repaint footer only when footer view changes
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/tui-app.test.ts tests/tui/renderer-terminal/transcript-renderer.test.ts`
Expected: PASS

### Task 4: Run regression verification

**Files:**
- Verify only

- [ ] **Step 1: Run targeted renderer verification**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/ansi-writer.test.ts tests/tui/renderer-terminal/terminal-session.test.ts tests/tui/renderer-terminal/transcript-renderer.test.ts tests/tui/renderer-terminal/tui-app.test.ts`
Expected: PASS

- [ ] **Step 2: Run broader regression**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS
