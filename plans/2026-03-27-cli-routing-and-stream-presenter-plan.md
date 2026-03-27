# CLI Routing And Stream Presenter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the old fullscreen-vs-plain entry behavior with the approved `--tui` / `--native` routing contract, add non-TTY safety guards plus stdin pipeline semantics, and introduce a real stream presenter for native single-shot and REPL flows.

**Architecture:** Split raw CLI parsing from route resolution so entrypoint behavior is decided by one pure resolver that consumes parsed flags plus stdio facts. Keep fullscreen blessed on `runInteractiveTui()`, add a new `StreamPresenter` plus native session runner for stream and REPL flows, and route deprecated `-p/--print` plus `BETA_TUI_RENDERER=terminal` through warning-based compatibility shims instead of preserving them as first-class surface area.

**Tech Stack:** Node.js 22+, TypeScript, Node test runner, existing `SessionManager` + interaction event schema, `node:readline/promises`, existing CLI/bootstrap/runtime modules.

---

## Scope Split

This plan intentionally implements only the newly approved CLI entry track:

- raw CLI surface for `beta`, positional prompts, `--native`, `--tui`, and deprecated `-p/--print`
- route resolution and non-TTY guards
- stdin pipeline assembly for `stdin + prompt` and `stdin only`
- a real stream presenter for native single-shot output and native REPL
- deprecation handling for `BETA_TUI_RENDERER=terminal`

This plan intentionally does **not** implement:

- SQLite command history and draft persistence
- changes to `--continue` / `--resume` semantics
- further runtime event-schema redesign beyond what the runtime-foundation pass already landed
- deletion of the old `renderer-terminal` files in this same patch

## File Map

- Create: `src/cli/route-resolution.ts`
- Create: `src/cli/stdin-pipeline.ts`
- Create: `src/cli/stream-presenter.ts`
- Create: `src/cli/run-native-session.ts`
- Create: `tests/cli/route-resolution.test.ts`
- Create: `tests/cli/stdin-pipeline.test.ts`
- Create: `tests/cli/stream-presenter.test.ts`
- Create: `tests/cli/run-native-session.test.ts`
- Modify: `src/cli/arg-parser.ts`
- Modify: `src/cli/entry.ts`
- Modify: `README.md`
- Modify: `tests/cli/arg-parser.test.ts`
- Modify: `tests/cli/entry.test.ts`
- Modify: `tests/cli/entry-terminal-renderer.test.ts`
- Modify: `tests/cli/install-metadata.test.ts`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

## Task 1: Split Raw CLI Parsing From Runtime Bootstrap Commands

**Files:**
- Modify: `src/cli/arg-parser.ts`
- Modify: `tests/cli/arg-parser.test.ts`

- [x] **Step 1: Write failing parser tests for the new public surface**

```ts
test("parses a positional prompt without treating it as fullscreen intent", () => {
  assert.deepEqual(parseCliArgs(["fix auth regression"]), {
    prompt: "fix auth regression",
  });
});

test("parses --native and --tui as explicit mode selectors", () => {
  assert.deepEqual(parseCliArgs(["--native"]), {
    explicitMode: "native",
  });

  assert.deepEqual(parseCliArgs(["--tui", "fix auth regression"]), {
    explicitMode: "tui",
    prompt: "fix auth regression",
  });
});

test("marks -p and --print as deprecated prompt aliases", () => {
  assert.deepEqual(parseCliArgs(["-p", "summarize this repository"]), {
    prompt: "summarize this repository",
    deprecatedPrintAlias: true,
  });
});

test("rejects conflicting explicit mode flags", () => {
  assert.throws(
    () => parseCliArgs(["--native", "--tui"]),
    /cannot combine --native and --tui/,
  );
});
```

- [x] **Step 2: Run the parser tests and verify they fail**

Run: `node --experimental-strip-types --test tests/cli/arg-parser.test.ts`
Expected: FAIL because `parseCliArgs()` still returns the older `interactive` / `print` surface.

- [x] **Step 3: Implement the new parsed-args surface while keeping `--continue` and `--resume` intact**

Implementation notes:

- Introduce a parsed-args type that represents raw CLI intent rather than runtime bootstrap state.
- Keep `--continue` and `--resume` behaviorally unchanged in this pass.
- Keep deprecated `-p/--print` parseable, but mark them explicitly so route resolution can emit warnings later.
- Do not let parser logic inspect TTY state, stdin payloads, or environment variables.

- [x] **Step 4: Re-run the parser tests and verify they pass**

Run: `node --experimental-strip-types --test tests/cli/arg-parser.test.ts`
Expected: PASS

## Task 2: Add Pure Route Resolution And Fail-Fast Entry Guards

**Files:**
- Create: `src/cli/route-resolution.ts`
- Create: `tests/cli/route-resolution.test.ts`

- [x] **Step 1: Write failing route-resolution tests for TTY, non-TTY, and deprecated-alias behavior**

```ts
test("bare beta on a full TTY resolves to blessed fullscreen", () => {
  assert.deepEqual(
    resolveCliRoute({
      parsed: parseCliArgs([]),
      stdinIsTTY: true,
      stdoutIsTTY: true,
      hasStdinPayload: false,
      deprecatedTerminalRendererEnv: false,
    }),
    {
      kind: "tui",
      bootstrapCommand: { kind: "interactive" },
      warnings: [],
    },
  );
});

test("beta with a positional prompt resolves to single-shot stream output", () => {
  assert.equal(
    resolveCliRoute({
      parsed: parseCliArgs(["fix auth regression"]),
      stdinIsTTY: true,
      stdoutIsTTY: true,
      hasStdinPayload: false,
      deprecatedTerminalRendererEnv: false,
    }).kind,
    "stream_single",
  );
});

test("stdin payload with no prompt resolves to single-shot stream output", () => {
  assert.equal(
    resolveCliRoute({
      parsed: parseCliArgs([]),
      stdinIsTTY: false,
      stdoutIsTTY: true,
      hasStdinPayload: true,
      deprecatedTerminalRendererEnv: false,
    }).kind,
    "stream_single",
  );
});

test("stdout redirection plus no prompt fail-fast when there is no visible interactive path", () => {
  const result = resolveCliRoute({
    parsed: parseCliArgs([]),
    stdinIsTTY: true,
    stdoutIsTTY: false,
    hasStdinPayload: false,
    deprecatedTerminalRendererEnv: false,
  });

  assert.equal(result.kind, "error");
  assert.match(result.message, /non-TTY environment/i);
});

test("deprecated print alias returns a warning instead of remaining a first-class route", () => {
  const result = resolveCliRoute({
    parsed: parseCliArgs(["-p", "say hello"]),
    stdinIsTTY: true,
    stdoutIsTTY: true,
    hasStdinPayload: false,
    deprecatedTerminalRendererEnv: false,
  });

  assert.equal(result.kind, "stream_single");
  assert.deepEqual(result.warnings, [
    expect.objectContaining({ code: "DEPRECATED_PRINT_ALIAS" }),
  ]);
});

test("deprecated BETA_TUI_RENDERER=terminal warns but does not replace routing intent", () => {
  const result = resolveCliRoute({
    parsed: parseCliArgs([]),
    stdinIsTTY: true,
    stdoutIsTTY: true,
    hasStdinPayload: false,
    deprecatedTerminalRendererEnv: true,
  });

  assert.equal(result.kind, "tui");
  assert.deepEqual(result.warnings, [
    expect.objectContaining({ code: "DEPRECATED_TERMINAL_RENDERER_ENV" }),
  ]);
});
```

- [x] **Step 2: Run the pure route-resolution tests and verify they fail**

Run: `node --experimental-strip-types --test tests/cli/route-resolution.test.ts`
Expected: FAIL because the pure resolver does not exist yet.

- [x] **Step 3: Implement the pure route resolver and fail-fast contract**

Implementation notes:

- `resolveCliRoute(...)` must be a pure function that depends only on plain data:
  - parsed args
  - `stdinIsTTY`
  - `stdoutIsTTY`
  - `hasStdinPayload`
  - deprecated-env presence
- **Hard constraint:** the tests in this task must not instantiate:
  - `SessionManager`
  - `ProviderRunner`
  - `runInteractiveTui()`
  - `StreamPresenter`
  - any network or file-backed runtime
- The resolver must encode the approved priority order:
  - non-TTY guard and fail-fast checks
  - explicit `--tui`
  - explicit `--native`
  - explicit prompt
  - bare `beta`
- Treat `--continue` / `--resume` as pass-through legacy routes in this pass.

- [x] **Step 4: Re-run the pure route-resolution tests and verify they pass**

Run: `node --experimental-strip-types --test tests/cli/route-resolution.test.ts`
Expected: PASS

## Task 3: Implement Stdin Pipeline Assembly As Pure I/O Helpers

**Files:**
- Create: `src/cli/stdin-pipeline.ts`
- Create: `tests/cli/stdin-pipeline.test.ts`

- [x] **Step 1: Write failing tests for stdin+prompt and stdin-only assembly**

```ts
test("combines an explicit prompt with stdin context", () => {
  assert.equal(
    assemblePromptFromPipeline({
      prompt: "help me optimize this code",
      stdinText: "def run():\n    pass\n",
    }),
    `[User Instruction]
help me optimize this code

[Additional Context]
def run():
    pass
`,
  );
});

test("wraps stdin-only input in the stable analysis prompt", () => {
  assert.match(
    assemblePromptFromPipeline({
      prompt: undefined,
      stdinText: "Traceback: boom",
    }),
    /Please analyze the following input/,
  );
});

test("preserves a plain prompt when no stdin payload exists", () => {
  assert.equal(
    assemblePromptFromPipeline({
      prompt: "say hello",
      stdinText: "",
    }),
    "say hello",
  );
});

test("reads all stdin text from a supplied readable without touching process.stdin", async () => {
  const input = Readable.from(["line 1\n", "line 2\n"]);
  assert.equal(await readAllStdin(input), "line 1\nline 2\n");
});
```

- [x] **Step 2: Run the stdin pipeline tests and verify they fail**

Run: `node --experimental-strip-types --test tests/cli/stdin-pipeline.test.ts`
Expected: FAIL because the pipeline helpers do not exist yet.

- [x] **Step 3: Implement stdin reading and pipeline prompt assembly**

Implementation notes:

- Keep the string assembly logic fully deterministic and testable.
- **Hard constraint:** the tests in this task must remain pure I/O tests and must not invoke the runtime, presenter, or provider stack.
- `readAllStdin(...)` should operate on an injected readable stream, not hardcode `process.stdin` inside the helper.
- `assemblePromptFromPipeline(...)` should be the only place that knows the wrapper strings for:
  - `stdin + prompt`
  - `stdin only`

- [x] **Step 4: Re-run the stdin pipeline tests and verify they pass**

Run: `node --experimental-strip-types --test tests/cli/stdin-pipeline.test.ts`
Expected: PASS

## Task 4: Introduce The Real Stream Presenter And Native Session Runner

**Files:**
- Create: `src/cli/stream-presenter.ts`
- Create: `src/cli/run-native-session.ts`
- Create: `tests/cli/stream-presenter.test.ts`
- Create: `tests/cli/run-native-session.test.ts`

- [x] **Step 1: Write failing presenter and runner tests**

```ts
test("stream presenter writes assistant output chunks directly to stdout", () => {
  let output = "";
  const presenter = createStreamPresenter({
    writeStdout: (chunk) => {
      output += chunk;
    },
    writeStderr: () => {},
  });

  presenter.onInteractionEvent(assistantStarted("request-1", "response-1"));
  presenter.onInteractionEvent(assistantChunk("request-1", "response-1", "hello"));
  presenter.onInteractionEvent(requestCompleted("request-1", "completed"));

  assert.equal(output, "hello");
});

test("stream presenter renders execution stream chunks without requiring a TUI timeline", () => {
  let output = "";
  const presenter = createStreamPresenter({
    writeStdout: (chunk) => {
      output += chunk;
    },
    writeStderr: () => {},
  });

  presenter.onInteractionEvent(executionStarted("request-1", "execution-1", "Run tests"));
  presenter.onInteractionEvent(executionChunk("request-1", "execution-1", "stdout", "ok\n"));

  assert.match(output, /Run tests/);
  assert.match(output, /ok/);
});

test("runNativeSession enters line-based REPL only for native_repl routes", async () => {
  const reads: string[] = [];
  await runNativeSession({
    route: { kind: "native_repl", bootstrapCommand: { kind: "interactive" }, warnings: [] },
    createInteractiveInput: () => ({
      readLine: async () => {
        reads.push("called");
        return null;
      },
      close: () => {},
    }),
    createSessionManager: () => fakeSessionManager,
  });

  assert.deepEqual(reads, ["called"]);
});
```

- [x] **Step 2: Run the presenter and runner tests and verify they fail**

Run: `node --experimental-strip-types --test tests/cli/stream-presenter.test.ts tests/cli/run-native-session.test.ts`
Expected: FAIL because the new presenter and native-session runner do not exist yet.

- [x] **Step 3: Implement the stream presenter and native-session runner**

Implementation notes:

- `StreamPresenter` should consume `onInteractionEvent` as the primary surface.
- It may continue to consume `onSystemLine` temporarily for non-eventized bootstrap/system text in this pass.
- Do **not** route through `src/tui/renderer-terminal/*`; that path is being retired from entrypoint selection, not elevated.
- `runNativeSession(...)` should reuse `createTerminalInteractiveInput()` for `--native` REPL mode rather than inventing another line-reader.
- Keep `SessionManager` construction injectable in tests so the runner tests stay offline and deterministic.

- [x] **Step 4: Re-run the presenter and runner tests and verify they pass**

Run: `node --experimental-strip-types --test tests/cli/stream-presenter.test.ts tests/cli/run-native-session.test.ts`
Expected: PASS

## Task 5: Rewire `entry.ts`, Migrate Docs, And Add Deprecation Warnings

**Files:**
- Modify: `src/cli/entry.ts`
- Modify: `README.md`
- Modify: `tests/cli/entry.test.ts`
- Modify: `tests/cli/entry-terminal-renderer.test.ts`
- Modify: `tests/cli/install-metadata.test.ts`

- [x] **Step 1: Write failing CLI entry tests for the new routing contract**

```ts
test("beta with a positional prompt uses stream mode even when stdin is a TTY", async () => {
  let tuiRuns = 0;
  let nativeRuns = 0;

  await runCli(["fix auth regression"], {
    stdinIsTTY: true,
    stdoutIsTTY: true,
    runInteractiveTui: async () => {
      tuiRuns += 1;
    },
    runNativeSession: async () => {
      nativeRuns += 1;
    },
  });

  assert.equal(tuiRuns, 0);
  assert.equal(nativeRuns, 1);
});

test("beta --tui keeps fullscreen behavior on a full TTY", async () => {
  let tuiRuns = 0;

  await runCli(["--tui", "fix auth regression"], {
    stdinIsTTY: true,
    stdoutIsTTY: true,
    runInteractiveTui: async () => {
      tuiRuns += 1;
    },
    runNativeSession: async () => {
      throw new Error("should not use native path");
    },
  });

  assert.equal(tuiRuns, 1);
});

test("deprecated -p still works but warns on stderr", async () => {
  let stderr = "";

  await runCli(["-p", "say hello"], {
    stdinIsTTY: true,
    stdoutIsTTY: true,
    writeStderr: (chunk) => {
      stderr += chunk;
    },
    runNativeSession: async () => {},
  });

  assert.match(stderr, /deprecated/i);
});

test("deprecated BETA_TUI_RENDERER=terminal warns and no longer switches the entry path", async () => {
  let stderr = "";
  let observedRenderer = "";

  await runCli([], {
    stdinIsTTY: true,
    stdoutIsTTY: true,
    processEnv: {
      BETA_TUI_RENDERER: "terminal",
    },
    writeStderr: (chunk) => {
      stderr += chunk;
    },
    runInteractiveTui: async (input) => {
      observedRenderer = input.tuiRenderer;
    },
  });

  assert.equal(observedRenderer, "blessed");
  assert.match(stderr, /BETA_TUI_RENDERER=terminal.*deprecated/i);
});
```

- [x] **Step 2: Run the CLI entry tests and verify they fail**

Run: `node --experimental-strip-types --test tests/cli/entry.test.ts tests/cli/entry-terminal-renderer.test.ts tests/cli/install-metadata.test.ts`
Expected: FAIL because `entry.ts` still routes positional prompts to fullscreen TUI, still treats `-p` as first-class, and still honors `BETA_TUI_RENDERER=terminal`.

- [x] **Step 3: Implement the new entry wiring and documentation migration**

Implementation notes:

- Add `stdoutIsTTY` and `writeStderr` injection points so CLI behavior can be tested without real terminals.
- Route entry behavior through the pure resolver and stdin-pipeline helpers before building bootstrap context.
- Keep fullscreen blessed only on:
  - bare `beta` in a full TTY
  - explicit `--tui` in a full TTY
- Route positional prompts and `--native "<prompt>"` through the new native stream path.
- Route `--native` with no prompt through the native REPL path.
- Keep deprecated `-p/--print` working, but emit one warning on `stderr`.
- Keep deprecated `BETA_TUI_RENDERER=terminal` warning-only; do not let it switch to `renderer-terminal`.
- Remove `-p` from README primary examples and migrate install-metadata assertions accordingly.

- [x] **Step 4: Re-run the CLI entry tests and verify they pass**

Run: `node --experimental-strip-types --test tests/cli/entry.test.ts tests/cli/entry-terminal-renderer.test.ts tests/cli/install-metadata.test.ts`
Expected: PASS

## Task 6: Run Full Verification And Update Working Memory

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify: `plans/2026-03-27-cli-routing-and-stream-presenter-plan.md`

- [x] **Step 1: Run the focused CLI routing and stream suite**

Run: `node --experimental-strip-types --test tests/cli/arg-parser.test.ts tests/cli/route-resolution.test.ts tests/cli/stdin-pipeline.test.ts tests/cli/stream-presenter.test.ts tests/cli/run-native-session.test.ts tests/cli/entry.test.ts tests/cli/entry-terminal-renderer.test.ts tests/cli/install-metadata.test.ts`
Expected: PASS

- [x] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS

- [x] **Step 3: Run typecheck**

Run: `npm run check`
Expected: PASS

- [x] **Step 4: Run build**

Run: `npm run build`
Expected: PASS

- [x] **Step 5: Update working memory and mark completed items**

Update:

- `task_plan.md`
- `findings.md`
- `progress.md`
- this plan file

## Notes

- Keep the current runtime foundation intact; this plan is an entrypoint and presenter migration, not another runtime event-schema redesign.
- Do not pull `--continue` / `--resume` into the cleanup blast radius.
- The pure guard and pipeline tests must remain isolated from runtime/presenter/business logic to prevent CI-only hang regressions.
- Do not route new behavior through `renderer-terminal`; the new native path is `StreamPresenter`, not a second TUI.
