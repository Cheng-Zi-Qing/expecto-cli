# Expecto CLI Command System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ad hoc built-in command list with a categorized command framework, then make `/help` and `/exit` reliable in the real interactive TUI path without leaking slash commands into the model path.

**Architecture:** Introduce a canonical command registry with stable internal ids, visible-category grouping, and explicit command exposure rules. Keep execution renderer-neutral by mapping commands to standardized effects, then tighten `runInteractiveTui` so any slash-prefixed input stays local while the command menu and `/help` both read from the same registry source of truth.

**Tech Stack:** TypeScript, Node test runner, existing `runtime-session` command effect path, interactive TUI state reducers, sticky terminal renderer, blessed renderer.

---

## File Map

- Create: `src/commands/command-registry.ts`
  - Own the canonical command descriptors, stable internal ids, category grouping, visible listings, hidden-command lookup, and structured help sections.
- Modify: `src/commands/command-types.ts`
  - Add namespaced command ids, category/availability types, help-section types, and typed command descriptor contracts.
- Modify: `src/commands/builtin-commands.ts`
  - Reduce this file to a compatibility wrapper or re-export layer so existing imports can transition incrementally without duplicating registry data.
- Modify: `src/commands/command-executor.ts`
  - Resolve commands through the registry, emit grouped `/help` output, preserve `/branch`, `/theme`, and `/exit` effects, and return a local error for unknown slash commands.
- Modify: `src/runtime/runtime-session.ts`
  - Only if needed to preserve built-in command completion semantics after the new unknown-command path; avoid broad refactors.
- Modify: `src/tui/tui-types.ts`
  - Type command menu items against the new command descriptor ids instead of generic strings.
- Modify: `src/tui/tui-state.ts`
  - Derive the slash command menu from visible implemented commands only and keep `/inspect` out of the discovery surfaces.
- Modify: `src/tui/run-interactive-tui.ts`
  - Treat any slash-prefixed draft as a local command candidate so `/help`, `/exit`, and unknown slash inputs never seed a model prompt lifecycle.
- Modify: `README.md`
  - Align user-facing command documentation with the first formal command batch and the new `/help` behavior.
- Test: `tests/commands/builtin-commands.test.ts`
  - Cover registry shape, category ordering, hidden `/inspect` compatibility, and visible command listings.
- Test: `tests/commands/command-executor.test.ts`
  - Cover grouped `/help`, `/exit`, `/theme`, `/branch`, and unknown slash local error handling.
- Test: `tests/runtime/interactive-session.test.ts`
  - Cover local slash handling without assistant leakage at the session-manager boundary.
- Test: `tests/runtime/session-manager.test.ts`
  - Cover local command events, hidden command compatibility, and unknown slash staying out of user/assistant streams.
- Test: `tests/tui/tui-state.test.ts`
  - Cover visible command menu derivation from the registry.
- Test: `tests/tui/run-interactive-tui.test.ts`
  - Cover `/help` timeline projection, `/exit` closure from the real interactive path, and command menu listings staying aligned with visible commands.

## Task 1: Introduce The Canonical Command Registry

**Files:**
- Create: `src/commands/command-registry.ts`
- Modify: `src/commands/command-types.ts`
- Modify: `src/commands/builtin-commands.ts`
- Test: `tests/commands/builtin-commands.test.ts`

- [ ] **Step 1: Write the failing registry tests**

```ts
test("listImplementedCommandsByCategory exposes only the first formal command set", () => {
  const sections = listImplementedCommandsByCategory();

  assert.deepEqual(
    sections.map((section) => ({
      category: section.category,
      commands: section.commands.map((command) => command.name),
    })),
    [
      {
        category: "session",
        commands: ["/help", "/status", "/clear", "/theme", "/exit"],
      },
      {
        category: "project",
        commands: ["/branch"],
      },
    ],
  );
});

test("findCommandByInput resolves hidden /inspect without exposing it in visible listings", () => {
  assert.equal(findCommandByInput("/inspect")?.id, "debug.inspect");
  assert.ok(!listImplementedCommands().some((command) => command.name === "/inspect"));
});
```

- [ ] **Step 2: Run the focused registry test and verify it fails**

Run:

```bash
node --experimental-strip-types --test tests/commands/builtin-commands.test.ts
```

Expected:

- FAIL because the current command model has no categories, no stable namespaced ids, and no hidden-command distinction

- [ ] **Step 3: Implement the registry and typed descriptor contract**

Implementation notes:

- add a `CommandId` union with:
  - `session.help`
  - `session.status`
  - `session.clear`
  - `session.theme`
  - `session.exit`
  - `project.branch`
  - `debug.inspect`
- add `CommandCategory` and `CommandAvailability` types
- model `/inspect` as hidden-but-resolvable compatibility, not as part of the visible first formal batch
- put the canonical descriptor array in `src/commands/command-registry.ts`
- expose:
  - `listAllCommands()`
  - `listImplementedCommands()`
  - `listImplementedCommandsByCategory()`
  - `findCommandByInput()`
  - `createHelpSections()`
- keep `src/commands/builtin-commands.ts` as a thin wrapper or re-export so existing imports do not duplicate data

- [ ] **Step 4: Re-run the focused registry test and verify it passes**

Run:

```bash
node --experimental-strip-types --test tests/commands/builtin-commands.test.ts
```

Expected:

- PASS with visible categories locked to `session` then `project`
- PASS with `/inspect` still resolvable through direct lookup but absent from visible command lists

- [ ] **Step 5: Commit the registry work**

```bash
git add \
  src/commands/command-types.ts \
  src/commands/command-registry.ts \
  src/commands/builtin-commands.ts \
  tests/commands/builtin-commands.test.ts
git commit -m "feat: add categorized command registry"
```

## Task 2: Route Execution Through The Registry And Fix `/help`

**Files:**
- Modify: `src/commands/command-executor.ts`
- Test: `tests/commands/command-executor.test.ts`

- [ ] **Step 1: Write the failing executor tests**

```ts
test("executeBuiltinCommand renders grouped help from visible registry sections", async () => {
  const result = await executeBuiltinCommand("/help", createContext());

  assert.equal(result.handled, true);
  assert.deepEqual(result.effects.slice(0, 4), [
    { type: "system_message", line: "Available commands" },
    { type: "system_message", line: "" },
    { type: "system_message", line: "Session" },
    { type: "system_message", line: "/help    Show available commands" },
  ]);
  assert.ok(result.effects.every((effect) => {
    return effect.type !== "system_message" || !effect.line.includes("/inspect");
  }));
});

test("executeBuiltinCommand returns a local error for unknown slash commands", async () => {
  const result = await executeBuiltinCommand("/wat", createContext());

  assert.equal(result.handled, true);
  assert.deepEqual(result.effects, [
    { type: "system_message", line: "Unknown command: /wat" },
    { type: "system_message", line: "Run /help to see available commands." },
  ]);
});

test("executeBuiltinCommand still returns exit_session for /exit", async () => {
  const result = await executeBuiltinCommand("/exit", createContext());

  assert.deepEqual(result.effects, [{ type: "exit_session" }]);
});

test("executeBuiltinCommand preserves clear and status behavior through registry-based resolution", async () => {
  const clearResult = await executeBuiltinCommand("/clear", createContext());
  const statusResult = await executeBuiltinCommand("/status", createContext());

  assert.deepEqual(clearResult.effects, [
    { type: "clear_conversation" },
    { type: "system_message", line: "conversation cleared" },
  ]);
  assert.ok(
    statusResult.effects.some((effect) => {
      return effect.type === "system_message";
    }),
  );
});
```

- [ ] **Step 2: Run the focused executor tests and verify they fail**

Run:

```bash
node --experimental-strip-types --test tests/commands/command-executor.test.ts
```

Expected:

- FAIL because `/help` is still a flat built-in list and unknown slash commands currently fall through as unhandled

- [ ] **Step 3: Implement grouped help and unknown slash local handling**

Implementation notes:

- resolve commands through `findCommandByInput()`
- if `parseSlashCommand()` succeeds but the registry lookup fails:
  - return `handled: true`
  - emit the two local error `system_message` effects
- build `/help` from `createHelpSections()` so the command menu and help output stay aligned
- keep existing effect shapes for:
  - `/status`
  - `/clear`
  - `/theme`
  - `/exit`
  - `/branch`
- preserve hidden-command registry resolution for `/inspect` and keep it out of grouped help and visible menu surfaces
- do not expand this task into a new `/inspect` UX contract; this command remains outside the first formal command batch

- [ ] **Step 4: Re-run the focused executor tests and verify they pass**

Run:

```bash
node --experimental-strip-types --test tests/commands/command-executor.test.ts
```

Expected:

- PASS with grouped `/help`
- PASS with unknown slash commands staying local
- PASS with `/exit`, `/theme`, and `/branch` preserving their existing effect behavior

- [ ] **Step 5: Commit the executor work**

```bash
git add \
  src/commands/command-executor.ts \
  tests/commands/command-executor.test.ts
git commit -m "feat: route command help and local errors through registry"
```

## Task 3: Move The Slash Command Menu Onto The Registry

**Files:**
- Modify: `src/tui/tui-types.ts`
- Modify: `src/tui/tui-state.ts`
- Test: `tests/tui/tui-state.test.ts`
- Test: `tests/tui/run-interactive-tui.test.ts`

- [ ] **Step 1: Write the failing command-menu tests**

```ts
test("reduceTuiState derives the slash menu from visible implemented commands only", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "beta-agent",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    contextMetrics: {
      percent: 0,
      rules: 0,
      hooks: 0,
      docs: 0,
    },
  });
  const next = reduceTuiState(initial, {
    type: "set_draft",
    draft: "/",
  });

  assert.deepEqual(
    next.commandMenu.items.map((item) => item.name),
    ["/help", "/status", "/clear", "/theme", "/exit", "/branch"],
  );
  assert.ok(!next.commandMenu.items.some((item) => item.name === "/inspect"));
});

test("runInteractiveTui command suggestions follow the visible registry order", async () => {
  // use the existing `FakeInteractiveTuiApp`, `createReturningUserConfigStore()`,
  // and `waitFor()` helpers from tests/tui/run-interactive-tui.test.ts
  // set draft "/" and assert the menu contains the six visible commands only
});

test("runInteractiveTui keeps Enter semantics bound to the typed draft, not the highlighted suggestion", async () => {
  // use the existing `FakeInteractiveTuiApp` harness
  // set draft "/h"
  // move command-menu selection down at least once
  // submit "/help"
  // assert the resulting timeline contains local help output
  // assert no command-menu suggestion text was applied into the submitted draft
});
```

- [ ] **Step 2: Run the focused TUI state tests and verify they fail**

Run:

```bash
node --experimental-strip-types --test \
  tests/tui/tui-state.test.ts \
  tests/tui/run-interactive-tui.test.ts
```

Expected:

- FAIL because the current menu still reads the raw built-in list and still exposes `/inspect`

- [ ] **Step 3: Implement visible-command menu derivation**

Implementation notes:

- update `CommandMenuItem["id"]` to use the stable command id type
- make `deriveCommandMenu()` read from `listImplementedCommands()`
- keep the existing prefix-only filter behavior
- preserve the rule that the menu hides once the draft contains whitespace
- preserve the rule that `Enter` submits the current typed draft exactly as-is, even when a menu item is highlighted
- do not add auto-complete or `Tab` application behavior in this delivery

- [ ] **Step 4: Re-run the focused TUI state tests and verify they pass**

Run:

```bash
node --experimental-strip-types --test \
  tests/tui/tui-state.test.ts \
  tests/tui/run-interactive-tui.test.ts
```

Expected:

- PASS with the visible command menu limited to the first formal command set
- PASS with `/inspect` absent from discovery surfaces

- [ ] **Step 5: Commit the command-menu work**

```bash
git add \
  src/tui/tui-types.ts \
  src/tui/tui-state.ts \
  tests/tui/tui-state.test.ts \
  tests/tui/run-interactive-tui.test.ts
git commit -m "feat: drive slash menu from visible command registry"
```

## Task 4: Make `/help` And `/exit` Reliable In The Real Interactive TUI Path

**Files:**
- Modify: `src/tui/run-interactive-tui.ts`
- Modify: `src/runtime/runtime-session.ts`
- Test: `tests/runtime/interactive-session.test.ts`
- Test: `tests/runtime/session-manager.test.ts`
- Test: `tests/tui/run-interactive-tui.test.ts`

- [ ] **Step 1: Write the failing end-to-end command-routing tests**

```ts
test("session manager keeps unknown slash commands local and out of prompt streams", async () => {
  const userPrompts: string[] = [];
  const assistantOutputs: string[] = [];
  const systemLines: string[] = [];
  const inputs = ["/wat", "/exit"];

  const manager = new SessionManager({
    write: () => {},
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: async () => {
      assert.fail("unknown slash commands must not reach the assistant step");
    },
    onUserPrompt: (prompt) => userPrompts.push(prompt),
    onAssistantOutput: (output) => assistantOutputs.push(output),
    onSystemLine: (line) => systemLines.push(line),
  });

  await manager.run(context);

  assert.deepEqual(userPrompts, []);
  assert.deepEqual(assistantOutputs, []);
  assert.ok(systemLines.includes("Unknown command: /wat"));
});

test("runInteractiveTui projects /help into the local timeline without starting a prompt lifecycle", async () => {
  // use the existing `FakeInteractiveTuiApp`, `createReturningUserConfigStore()`,
  // `makeProjectRoot()`, and `waitFor()` helpers from tests/tui/run-interactive-tui.test.ts
  // submit "/help"
  // assert no user timeline item was created
  // assert system timeline includes "Available commands" and excludes "/inspect"
});

test("runInteractiveTui exits when /exit is submitted from the real TUI path", async () => {
  // use the existing `FakeInteractiveTuiApp` harness
  // submit "/exit"
  // assert assistantStep not called
  // assert app.closed === true after run resolves
});

test("runInteractiveTui treats bare quit as the same local exit command as bare exit", async () => {
  // use the existing `FakeInteractiveTuiApp` harness
  // submit "quit"
  // assert assistantStep not called
  // assert the app closes after run resolves
});
```

- [ ] **Step 2: Run the focused interactive tests and verify they fail**

Run:

```bash
node --experimental-strip-types --test \
  tests/runtime/interactive-session.test.ts \
  tests/runtime/session-manager.test.ts \
  tests/tui/run-interactive-tui.test.ts
```

Expected:

- FAIL because `runInteractiveTui` currently treats unknown slash drafts as prompt-like for lifecycle seeding
- FAIL if `/help` still creates user-prompt lifecycle artifacts instead of staying purely local
- FAIL if `/exit` still depends on brittle menu or prompt-path behavior

- [ ] **Step 3: Tighten local command routing in `runInteractiveTui`**

Implementation notes:

- replace the current "known built-in command" gate with a stronger local-command rule:
  - any normalized draft that starts with `/` is a local command candidate
  - `exit` and `quit` still normalize to `/exit`
- do not seed a foreground prompt lifecycle for any slash-prefixed input
- keep slash inputs flowing into `SessionManager` so the executor remains the single command authority
- preserve the command-menu rule that highlighted suggestions must not rewrite the submitted draft on `Enter`
- only preserve prompt lifecycle seeding for genuine model prompts
- avoid broad changes in `runtime-session.ts`; only touch it if command completion semantics need adjustment after the new unknown-command path

- [ ] **Step 4: Re-run the focused interactive tests and verify they pass**

Run:

```bash
node --experimental-strip-types --test \
  tests/runtime/interactive-session.test.ts \
  tests/runtime/session-manager.test.ts \
  tests/tui/run-interactive-tui.test.ts
```

Expected:

- PASS with unknown slash commands staying local
- PASS with `/help` projecting into the timeline as system output only
- PASS with `/exit`, bare `exit`, and bare `quit` all closing from the real interactive path

- [ ] **Step 5: Commit the routing fixes**

```bash
git add \
  src/tui/run-interactive-tui.ts \
  src/runtime/runtime-session.ts \
  tests/runtime/interactive-session.test.ts \
  tests/runtime/session-manager.test.ts \
  tests/tui/run-interactive-tui.test.ts
git commit -m "fix: keep slash commands local in interactive tui"
```

## Task 5: Align User-Facing Docs And Run Final Verification

**Files:**
- Modify: `README.md`
- Verify: `tests/commands/builtin-commands.test.ts`
- Verify: `tests/commands/command-executor.test.ts`
- Verify: `tests/runtime/interactive-session.test.ts`
- Verify: `tests/runtime/session-manager.test.ts`
- Verify: `tests/tui/tui-state.test.ts`
- Verify: `tests/tui/run-interactive-tui.test.ts`

- [ ] **Step 1: Update README command documentation to match the first formal command batch**

Update the interactive command section so it reflects:

- `/help`
- `/status`
- `/clear`
- `/theme`
- `/branch`
- `/exit`

If `/inspect` remains available as a hidden compatibility command, keep it documented only in an advanced/log-inspection context rather than in the primary first-batch command list.

- [ ] **Step 2: Run the targeted command and TUI test suite**

Run:

```bash
node --experimental-strip-types --test \
  tests/commands/builtin-commands.test.ts \
  tests/commands/command-executor.test.ts \
  tests/runtime/interactive-session.test.ts \
  tests/runtime/session-manager.test.ts \
  tests/tui/tui-state.test.ts \
  tests/tui/run-interactive-tui.test.ts
```

Expected:

- PASS with zero failing tests

- [ ] **Step 3: Run the TypeScript build**

Run:

```bash
npm run build
```

Expected:

- PASS with `tsc -p tsconfig.json`

- [ ] **Step 4: Perform one manual local smoke check in the worktree**

Run:

```bash
cd /Users/clement/Workspace/beta-agent/.worktrees/theme-system-init
npm run dev
```

Manual checks:

- type `/help` and press `Enter`
- confirm the timeline shows grouped local help output
- type `/exit` and press `Enter`
- confirm the session closes without producing a user prompt or assistant step
- type `quit`
- confirm it closes through the same local exit path as `/exit`
- type `/wat`
- confirm the timeline shows the local unknown-command error and no model request is started

- [ ] **Step 5: Commit docs and final verification changes**

```bash
git add \
  README.md \
  src/commands/command-types.ts \
  src/commands/command-registry.ts \
  src/commands/builtin-commands.ts \
  src/commands/command-executor.ts \
  src/tui/tui-types.ts \
  src/tui/tui-state.ts \
  src/tui/run-interactive-tui.ts \
  src/runtime/runtime-session.ts \
  tests/commands/builtin-commands.test.ts \
  tests/commands/command-executor.test.ts \
  tests/runtime/interactive-session.test.ts \
  tests/runtime/session-manager.test.ts \
  tests/tui/tui-state.test.ts \
  tests/tui/run-interactive-tui.test.ts
git commit -m "feat: formalize the first interactive command system"
```
