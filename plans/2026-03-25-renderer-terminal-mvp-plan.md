# Renderer Terminal MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal `renderer-terminal` path for `beta` that keeps terminal-native scrolling and drag-to-copy while preserving fullscreen composer + status interaction.

**Architecture:** Keep `runInteractiveTui()` and runtime/session plumbing intact, add a renderer-neutral view model layer, then implement a new ANSI-driven renderer that owns footer/overlay while leaving transcript behavior close to terminal scrollback. Do not replace `renderer-blessed` yet; wire the new renderer behind an explicit selector for side-by-side validation.

**Tech Stack:** Node.js 22, TypeScript, ANSI terminal control sequences, existing `node:test` suite, existing TUI runtime/state modules.

---

## Preconditions

- The current directory `/Users/clement/Workspace/beta-agent` is **not a git repository**. A true feature branch/worktree cannot be created until `.git` is restored or `git init` is explicitly approved.
- Until that is resolved, implementation can only proceed:
  - in-place in this directory, or
  - in a manually copied experimental directory.
- Do **not** couple the renderer experiment to provider/runtime changes.

## File Map

### Existing files to modify

- `src/cli/entry.ts`
  - Select renderer implementation without changing CLI user flow.
- `src/tui/tui-app.ts`
  - Keep the renderer factory contract stable; extend only if the terminal renderer truly needs a new capability.
- `src/tui/run-interactive-tui.ts`
  - Reuse the existing runtime loop; only adjust if the new renderer needs additional lifecycle hooks.
- `src/tui/tui-state.ts`
  - Keep state stable unless the MVP needs one small additive flag.
- `src/tui/renderer-blessed/tui-app.ts`
  - Migrate any reusable presentation logic out of the renderer as view-model code is introduced.

### New files to create

- `src/tui/view-model/tui-view-model.ts`
  - Convert `TuiState` into renderer-neutral transcript/footer/overlay data.
- `src/tui/view-model/tui-view-types.ts`
  - Stable presentation contracts for transcript blocks, footer view, status items, and overlay content.
- `src/tui/renderer-terminal/ansi-writer.ts`
  - Low-level cursor movement, erase, save/restore cursor, scroll-region helpers.
- `src/tui/renderer-terminal/terminal-session.ts`
  - Alternate screen, raw mode, cursor visibility, resize subscription, teardown.
- `src/tui/renderer-terminal/text-layout.ts`
  - Wrap/layout helpers for plain text blocks used by transcript/footer.
- `src/tui/renderer-terminal/transcript-renderer.ts`
  - Append/replay transcript output inside the non-footer region.
- `src/tui/renderer-terminal/footer-renderer.ts`
  - Draw the fixed composer/status region with clear contrast.
- `src/tui/renderer-terminal/input-driver.ts`
  - Parse stdin keys into high-level TUI actions for composer mode.
- `src/tui/renderer-terminal/tui-app.ts`
  - `createTerminalTuiApp()` implementation conforming to `InteractiveTuiApp`.

### New tests to create

- `tests/tui/view-model/tui-view-model.test.ts`
- `tests/tui/renderer-terminal/ansi-writer.test.ts`
- `tests/tui/renderer-terminal/text-layout.test.ts`
- `tests/tui/renderer-terminal/footer-renderer.test.ts`
- `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- `tests/tui/renderer-terminal/tui-app.test.ts`
- `tests/cli/entry-terminal-renderer.test.ts`

---

### Task 1: Introduce renderer-neutral view contracts

**Files:**
- Create: `src/tui/view-model/tui-view-types.ts`
- Create: `src/tui/view-model/tui-view-model.ts`
- Test: `tests/tui/view-model/tui-view-model.test.ts`
- Modify: `src/tui/renderer-blessed/tui-app.ts`

- [ ] **Step 1: Write the failing test**

```typescript
test("buildTuiViewModel derives transcript blocks and footer state from TuiState", () => {
  const state = createSampleTuiState({
    draft: "inspect auth flow",
    runtimeState: "streaming",
    timeline: [
      { id: "user-1", kind: "user", summary: "inspect auth flow", body: "inspect auth flow" },
      { id: "assistant-1", kind: "assistant", summary: "reading files", body: "reading files" },
    ],
  });

  const view = buildTuiViewModel(state);

  assert.equal(view.transcript.blocks.length, 2);
  assert.equal(view.footer.composer.value, "inspect auth flow");
  assert.equal(view.footer.status.runtimeLabel, "Thinking");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/tui/view-model/tui-view-model.test.ts`
Expected: FAIL because `tui-view-model.ts` and contracts do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
export type TranscriptBlock = {
  id: string;
  tone: "welcome" | "user" | "assistant" | "execution" | "system";
  title: string;
  bodyLines: string[];
  collapsed: boolean;
};

export function buildTuiViewModel(state: TuiState): TuiViewModel {
  return {
    transcript: {
      blocks: state.timeline.map((item) => ({
        id: item.id,
        tone: item.kind,
        title: item.summary,
        bodyLines: item.body ? item.body.split("\n") : [],
        collapsed: item.collapsed ?? false,
      })),
    },
    footer: {
      composer: {
        value: state.draft,
        locked: state.inputLocked,
      },
      status: {
        runtimeLabel: displayRuntimeState(state.runtimeState),
      },
    },
    overlay: null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/tui/view-model/tui-view-model.test.ts tests/tui/renderer-blessed/tui-app.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tui/view-model/tui-view-types.ts src/tui/view-model/tui-view-model.ts src/tui/renderer-blessed/tui-app.ts tests/tui/view-model/tui-view-model.test.ts
git commit -m "refactor: introduce renderer-neutral tui view model"
```

Note: blocked until git metadata exists.

---

### Task 2: Build terminal session primitives with test-first coverage

**Files:**
- Create: `src/tui/renderer-terminal/ansi-writer.ts`
- Create: `src/tui/renderer-terminal/terminal-session.ts`
- Test: `tests/tui/renderer-terminal/ansi-writer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
test("createAnsiWriter emits clear and cursor movement sequences in order", () => {
  const writes: string[] = [];
  const writer = createAnsiWriter((chunk) => writes.push(chunk));

  writer.hideCursor();
  writer.moveCursor(10, 4);
  writer.clearLine();
  writer.showCursor();

  assert.deepEqual(writes, ["\\u001b[?25l", "\\u001b[4;10H", "\\u001b[2K", "\\u001b[?25h"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/ansi-writer.test.ts`
Expected: FAIL because the renderer-terminal primitives do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
export function createAnsiWriter(write: (chunk: string) => void) {
  return {
    hideCursor: () => write("\u001b[?25l"),
    showCursor: () => write("\u001b[?25h"),
    clearLine: () => write("\u001b[2K"),
    moveCursor: (column: number, row: number) => write(`\u001b[${row};${column}H`),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/ansi-writer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tui/renderer-terminal/ansi-writer.ts src/tui/renderer-terminal/terminal-session.ts tests/tui/renderer-terminal/ansi-writer.test.ts
git commit -m "feat: add terminal renderer session primitives"
```

Note: blocked until git metadata exists.

---

### Task 3: Implement transcript/footer rendering without mouse capture

**Files:**
- Create: `src/tui/renderer-terminal/text-layout.ts`
- Create: `src/tui/renderer-terminal/transcript-renderer.ts`
- Create: `src/tui/renderer-terminal/footer-renderer.ts`
- Test: `tests/tui/renderer-terminal/text-layout.test.ts`
- Test: `tests/tui/renderer-terminal/transcript-renderer.test.ts`
- Test: `tests/tui/renderer-terminal/footer-renderer.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
test("renderTranscript appends visible block lines without mouse-only affordances", () => {
  const output = renderTranscript(view.transcript, { width: 80, height: 20 });
  assert.match(output.join("\n"), /Assistant/);
  assert.doesNotMatch(output.join("\n"), /\\{open\\}|wheelup|wheeldown/);
});

test("renderFooter emits a dark composer line and concise status line", () => {
  const footer = renderFooter(view.footer, { width: 80, composerHeight: 4 });
  assert.match(footer.join("\n"), /Write a prompt/);
  assert.match(footer.join("\n"), /Thinking|Done|Running tool/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/text-layout.test.ts tests/tui/renderer-terminal/transcript-renderer.test.ts tests/tui/renderer-terminal/footer-renderer.test.ts`
Expected: FAIL because the new renderer files do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
export function wrapPlainText(text: string, width: number): string[] {
  // Minimal MVP: split by newline, then wrap long lines greedily.
}

export function renderTranscript(transcript: TranscriptView, viewport: Viewport): string[] {
  return transcript.blocks.flatMap((block) => [
    formatBlockHeader(block),
    ...renderBlockBody(block, viewport.width),
    "",
  ]);
}

export function renderFooter(footer: FooterView, layout: FooterLayout): string[] {
  return [
    ` beta | ${footer.status.providerLabel}/${footer.status.modelLabel} | ${footer.status.runtimeLabel}`,
    ` ${footer.composer.value || "Write a prompt"}`,
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/text-layout.test.ts tests/tui/renderer-terminal/transcript-renderer.test.ts tests/tui/renderer-terminal/footer-renderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tui/renderer-terminal/text-layout.ts src/tui/renderer-terminal/transcript-renderer.ts src/tui/renderer-terminal/footer-renderer.ts tests/tui/renderer-terminal/text-layout.test.ts tests/tui/renderer-terminal/transcript-renderer.test.ts tests/tui/renderer-terminal/footer-renderer.test.ts
git commit -m "feat: render terminal transcript and footer"
```

Note: blocked until git metadata exists.

---

### Task 4: Implement `createTerminalTuiApp()` and integrate with the interactive loop

**Files:**
- Create: `src/tui/renderer-terminal/input-driver.ts`
- Create: `src/tui/renderer-terminal/tui-app.ts`
- Test: `tests/tui/renderer-terminal/tui-app.test.ts`
- Modify: `src/tui/tui-app.ts`
- Modify: `src/tui/run-interactive-tui.ts`

- [ ] **Step 1: Write the failing test**

```typescript
test("createTerminalTuiApp renders transcript updates and routes submit/interruption events", async () => {
  const writes: string[] = [];
  const app = createTerminalTuiApp({
    initialState,
    handlers,
    write: (chunk) => writes.push(chunk),
    stdin: fakeStdin,
    stdout: fakeStdout,
  });

  await app.start();
  app.update(nextState);

  assert.match(writes.join(""), /assistant: inspect auth flow/);
  assert.equal(fakeStdin.rawMode, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/tui-app.test.ts`
Expected: FAIL because `createTerminalTuiApp()` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
export function createTerminalTuiApp(input: TerminalTuiAppFactoryInput): InteractiveTuiApp {
  const session = createTerminalSession(input.io);
  let state = input.initialState;

  return {
    async start() {
      session.enter();
      renderAll(state);
    },
    update(nextState) {
      state = nextState;
      renderAll(state);
    },
    async close() {
      session.leave();
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/tui/renderer-terminal/tui-app.test.ts tests/tui/run-interactive-tui.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tui/renderer-terminal/input-driver.ts src/tui/renderer-terminal/tui-app.ts src/tui/tui-app.ts src/tui/run-interactive-tui.ts tests/tui/renderer-terminal/tui-app.test.ts
git commit -m "feat: add interactive terminal tui renderer"
```

Note: blocked until git metadata exists.

---

### Task 5: Wire renderer selection into the CLI and verify the MVP path

**Files:**
- Modify: `src/cli/entry.ts`
- Test: `tests/cli/entry-terminal-renderer.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
test("runCliCommand selects terminal renderer when BETA_TUI_RENDERER=terminal", async () => {
  let usedRenderer = "";

  await runCliForTest({
    env: {
      BETA_TUI_RENDERER: "terminal",
      BETA_PROVIDER: "anthropic",
    },
    runInteractiveTui: async () => {
      usedRenderer = "terminal";
    },
  });

  assert.equal(usedRenderer, "terminal");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/cli/entry-terminal-renderer.test.ts`
Expected: FAIL because renderer selection is not implemented.

- [ ] **Step 3: Write minimal implementation**

```typescript
function resolveTuiRenderer(env: Record<string, string | undefined>): "blessed" | "terminal" {
  return env.BETA_TUI_RENDERER === "terminal" ? "terminal" : "blessed";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/cli/entry-terminal-renderer.test.ts tests/cli/entry.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/cli/entry.ts tests/cli/entry-terminal-renderer.test.ts
git commit -m "feat: wire terminal tui renderer selector"
```

Note: blocked until git metadata exists.

---

### Task 6: End-to-end verification for the renderer-terminal MVP

**Files:**
- Modify as needed based on failures from prior tasks.

- [ ] **Step 1: Run targeted renderer tests**

Run: `node --experimental-strip-types --test tests/tui/view-model/tui-view-model.test.ts tests/tui/renderer-terminal/*.test.ts tests/tui/run-interactive-tui.test.ts`
Expected: PASS

- [ ] **Step 2: Run CLI selection tests**

Run: `node --experimental-strip-types --test tests/cli/entry.test.ts tests/cli/entry-terminal-renderer.test.ts`
Expected: PASS

- [ ] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Smoke test the experimental renderer**

Run: `BETA_TUI_RENDERER=terminal npm run dev -- "say hello in one sentence"`
Expected: fullscreen terminal renderer starts, footer stays fixed, transcript displays response, terminal-native drag selection remains available.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: add renderer-terminal mvp"
```

Note: blocked until git metadata exists.
