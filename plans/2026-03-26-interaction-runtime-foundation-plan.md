# Interaction Runtime Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the typed interaction event envelope, request-ledger-driven composer locking, and lifecycle-aware assistant/execution state for the blessed interactive path without yet implementing the full native stream presenter or SQLite command-history layer.

**Architecture:** Add a new presenter-facing interaction event contract separate from the existing persisted event-log schema, then make `RuntimeSession` emit request-scoped lifecycle events through a compatibility bridge. Build pure `request-ledger` and `execution-transcript-buffer` modules, wire them into the renderer-neutral TUI state, and migrate `runInteractiveTui()` to unlock only on `request_completed`. Keep provider integration compatible by adapting today’s one-shot assistant responses into the new envelope shape; real provider streaming and native stream presenter work stay in follow-up plans.

**Tech Stack:** Node.js 22+, TypeScript, ESM, Zod, Node test runner, existing runtime/session loop, existing fullscreen TUI stack, `neo-blessed` isolated under `src/tui/renderer-blessed/*`

---

## Scope Split

This plan intentionally implements only the runtime foundation required by `specs/2026-03-26-cli-interaction-contract.md`:

- typed interaction event schema
- request terminal event
- request ledger and unlock rules
- assistant/execution lifecycle projection into blessed TUI state
- capped execution transcript buffer

This plan intentionally does **not** implement:

- new CLI routing / `--native` / non-TTY entry guards
- native stream presenter
- SQLite command history and draft persistence
- real provider streaming or real model tool-calling adapters

Those should land in separate follow-up plans after this foundation pass is green.

## File Map

- Create: `src/contracts/interaction-event-schema.ts`
- Create: `src/tui/request-ledger.ts`
- Create: `src/tui/execution-transcript-buffer.ts`
- Create: `tests/contracts/interaction-event-schema.test.ts`
- Create: `tests/tui/request-ledger.test.ts`
- Create: `tests/tui/execution-transcript-buffer.test.ts`
- Modify: `src/runtime/runtime-session.ts`
- Modify: `src/runtime/session-manager.ts`
- Modify: `src/runtime/session-factory.ts`
- Modify: `src/providers/provider-runner.ts`
- Modify: `src/tui/tui-types.ts`
- Modify: `src/tui/tui-state.ts`
- Modify: `src/tui/run-interactive-tui.ts`
- Modify: `src/tui/view-model/timeline-blocks.ts`
- Modify: `tests/runtime/session-manager.test.ts`
- Modify: `tests/runtime/interactive-session.test.ts`
- Modify: `tests/tui/tui-state.test.ts`
- Modify: `tests/tui/run-interactive-tui.test.ts`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

## Task 1: Freeze The Presenter-Facing Interaction Event Contract

**Files:**
- Create: `src/contracts/interaction-event-schema.ts`
- Create: `tests/contracts/interaction-event-schema.test.ts`

- [x] **Step 1: Write failing schema tests for assistant, execution, and request terminal events**

```ts
test("interaction event schema accepts tool-call completion only when plannedExecutionIds are present", () => {
  assert.doesNotThrow(() =>
    interactionEventSchema.parse({
      eventType: "assistant_response_completed",
      timestamp: "2026-03-26T00:00:00.000Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-1",
      payload: {
        responseId: "response-1",
        finishReason: "tool_calls",
        continuation: "awaiting_execution",
        plannedExecutionIds: ["execution-1", "execution-2"],
        errorCode: null,
        usage: null,
      },
    }),
  );

  assert.throws(() =>
    interactionEventSchema.parse({
      eventType: "assistant_response_completed",
      timestamp: "2026-03-26T00:00:00.000Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-1",
      payload: {
        responseId: "response-1",
        finishReason: "tool_calls",
        continuation: "awaiting_execution",
        plannedExecutionIds: [],
        errorCode: null,
        usage: null,
      },
    }),
  );
});

test("interaction event schema rejects multiline execution summaries", () => {
  assert.throws(() =>
    interactionEventSchema.parse({
      eventType: "execution_item_completed",
      timestamp: "2026-03-26T00:00:00.000Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-1",
      payload: {
        executionId: "execution-1",
        status: "error",
        summary: "line 1\nline 2",
        exitCode: 1,
        errorCode: null,
      },
    }),
  );
});
```

- [x] **Step 2: Run the contract tests and verify they fail**

Run: `node --experimental-strip-types --test tests/contracts/interaction-event-schema.test.ts`
Expected: FAIL because the interaction event schema file does not exist yet.

- [x] **Step 3: Implement the new interaction event schema and exported TypeScript types**

```ts
export const interactionEventSchema = z.discriminatedUnion("eventType", [
  assistantResponseStartedEventSchema,
  assistantStreamChunkEventSchema,
  assistantResponseCompletedEventSchema,
  executionItemStartedEventSchema,
  executionItemChunkEventSchema,
  executionItemCompletedEventSchema,
  requestCompletedEventSchema,
]);
```

- [x] **Step 4: Re-run the contract tests and verify they pass**

Run: `node --experimental-strip-types --test tests/contracts/interaction-event-schema.test.ts`
Expected: PASS

## Task 2: Add A Compatibility Bridge So Runtime Can Emit Typed Interaction Events

**Files:**
- Modify: `src/runtime/runtime-session.ts`
- Modify: `src/runtime/session-manager.ts`
- Modify: `src/runtime/session-factory.ts`
- Modify: `src/providers/provider-runner.ts`
- Modify: `tests/runtime/session-manager.test.ts`
- Modify: `tests/runtime/interactive-session.test.ts`

- [x] **Step 1: Write failing runtime tests for event emission order and terminal unlock closure**

```ts
test("session manager emits assistant lifecycle envelopes and request_completed for a one-shot assistant result", async () => {
  const events: string[] = [];
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async () => ({
      kind: "output",
      responseId: "response-1",
      output: "assistant: hi",
      finishReason: "stop",
      usage: null,
    }),
    onInteractionEvent: (event) => {
      events.push(event.eventType);
    },
  });

  await manager.run(context);

  assert.deepEqual(events, [
    "assistant_response_started",
    "assistant_stream_chunk",
    "assistant_response_completed",
    "request_completed",
  ]);
});

test("session manager emits request_completed(interrupted) on abort", async () => {
  const completed: string[] = [];
  const manager = new SessionManager({
    write: () => {},
    readLine: () => Promise.resolve(inputs.shift() ?? null),
    assistantStep: ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true,
        });
      }),
    onInteractionEvent: (event) => {
      if (event.eventType === "request_completed") {
        completed.push(event.payload.status);
      }
    },
  });

  await manager.run(context);
  assert.deepEqual(completed, ["interrupted"]);
});
```

- [x] **Step 2: Run the targeted runtime tests and verify they fail**

Run: `node --experimental-strip-types --test tests/runtime/session-manager.test.ts tests/runtime/interactive-session.test.ts`
Expected: FAIL because `SessionManager` and `RuntimeSession` do not expose typed interaction events yet.

- [x] **Step 3: Introduce the new `onInteractionEvent` hook and adapt current one-shot assistant results into lifecycle envelopes**

```ts
export type AssistantStepResult =
  | {
      kind: "output";
      responseId: string;
      output: string;
      finishReason: "stop" | "max_tokens" | "content_filter";
      usage: AssistantUsage | null;
    }
  | {
      kind: "tool_calls";
      responseId: string;
      plannedExecutionIds: string[];
      usage: AssistantUsage | null;
    };

this.emitInteractionEvent({
  eventType: "assistant_response_started",
  timestamp: nowIsoString(),
  sessionId: this.sessionId,
  turnId,
  requestId,
  payload: { responseId: result.responseId },
});
```

Implementation notes:

- keep the old hooks (`onAssistantOutput`, `onExecutionItem`, `onRuntimeStateChange`) temporarily so existing non-migrated callers do not break in the same patch
- add a helper inside `RuntimeSession` to sanitize execution summaries before emitting `execution_item_completed`
- add `request_completed` in all terminal paths:
  - normal success
  - interrupt
  - runtime error
- adapt `ProviderRunner.createAssistantStep()` to return the new `AssistantStepResult` output variant for today’s static full-text providers

- [x] **Step 4: Re-run the targeted runtime tests and verify they pass**

Run: `node --experimental-strip-types --test tests/runtime/session-manager.test.ts tests/runtime/interactive-session.test.ts`
Expected: PASS

## Task 3: Build Pure Request-Ledger And Execution-Transcript Modules

**Files:**
- Create: `src/tui/request-ledger.ts`
- Create: `src/tui/execution-transcript-buffer.ts`
- Create: `tests/tui/request-ledger.test.ts`
- Create: `tests/tui/execution-transcript-buffer.test.ts`

- [x] **Step 1: Write failing pure-state tests for lock/unlock rules, parallel wave tracking, and batched transcript truncation**

```ts
test("request ledger stays locked until request_completed even after all execution ids finish", () => {
  let ledger = createForegroundRequestLedger({
    requestId: "request-1",
    turnId: "turn-1",
    startedAt: "2026-03-26T00:00:00.000Z",
  });

  ledger = reduceRequestLedger(ledger, {
    eventType: "assistant_response_completed",
    payload: {
      responseId: "response-1",
      finishReason: "tool_calls",
      continuation: "awaiting_execution",
      plannedExecutionIds: ["execution-1", "execution-2"],
      errorCode: null,
      usage: null,
    },
  });

  ledger = reduceRequestLedger(ledger, executionStarted("execution-1"));
  ledger = reduceRequestLedger(ledger, executionStarted("execution-2"));
  ledger = reduceRequestLedger(ledger, executionCompleted("execution-1", "success"));
  ledger = reduceRequestLedger(ledger, executionCompleted("execution-2", "error"));

  assert.equal(ledger.phase, "awaiting_assistant_resume");
  assert.equal(isComposerLocked(ledger), true);

  ledger = reduceRequestLedger(ledger, requestCompleted("error"));
  assert.equal(isComposerLocked(ledger), false);
});

test("execution transcript buffer keeps head and tail while truncating in one batched append", () => {
  const buffer = appendTranscriptChunk(createExecutionTranscriptBuffer(), hugeChunkOfLines(5000));

  assert.equal(buffer.headLines.length, 100);
  assert.equal(buffer.tailLines.length, 2000);
  assert.ok(buffer.omittedLineCount > 0);
});
```

- [x] **Step 2: Run the pure-state tests and verify they fail**

Run: `node --experimental-strip-types --test tests/tui/request-ledger.test.ts tests/tui/execution-transcript-buffer.test.ts`
Expected: FAIL because the pure modules do not exist yet.

- [x] **Step 3: Implement the pure ledger and transcript-buffer reducers**

```ts
export function isComposerLocked(ledger: ForegroundRequestLedger | null): boolean {
  return ledger !== null && ledger.terminalEventReceived === false;
}

export function appendTranscriptChunk(
  buffer: ExecutionTranscriptBuffer,
  output: string,
): AppendTranscriptResult {
  // append all committed lines in one batch
  // fill head first
  // then keep only the capped tail slice once
}
```

Implementation notes:

- keep `phase` as a derived label, not the sole truth source
- include explicit execution wave sets:
  - planned
  - started
  - completed
  - failed
  - interrupted
- keep transcript storage as head/tail arrays plus `pendingFragment`
- do not rebuild the full tail array once per line

- [x] **Step 4: Re-run the pure-state tests and verify they pass**

Run: `node --experimental-strip-types --test tests/tui/request-ledger.test.ts tests/tui/execution-transcript-buffer.test.ts`
Expected: PASS

## Task 4: Rewire The Blessed Interactive Path Around The Request Ledger

**Files:**
- Modify: `src/tui/tui-types.ts`
- Modify: `src/tui/tui-state.ts`
- Modify: `src/tui/run-interactive-tui.ts`
- Modify: `src/tui/view-model/timeline-blocks.ts`
- Modify: `tests/tui/tui-state.test.ts`
- Modify: `tests/tui/run-interactive-tui.test.ts`

- [x] **Step 1: Write failing TUI tests for request-complete-only unlock and execution-card updates**

```ts
test("runInteractiveTui keeps input locked until request_completed arrives", async () => {
  app.submit("inspect auth flow");

  await waitFor(() => app?.latestState().runtimeState === "streaming", "expected streaming");
  assert.equal(app?.latestState().inputLocked, true);

  await waitFor(
    () => app?.latestState().timeline.some((item) => item.kind === "assistant"),
    "expected assistant card",
  );

  assert.equal(app?.latestState().inputLocked, false);
});

test("reduceTuiState clears execution unread lines when a collapsed execution card is expanded", () => {
  let state = withCollapsedExecutionCard(initialState);
  state = reduceTuiState(state, appendExecutionChunk("execution-1", "line 1\nline 2\n"));
  assert.equal(getExecutionItem(state, "execution-1")?.unreadLines, 2);

  state = reduceTuiState(state, { type: "toggle_selected_item" });
  assert.equal(getExecutionItem(state, "execution-1")?.collapsed, false);
  assert.equal(getExecutionItem(state, "execution-1")?.unreadLines, 0);
});
```

- [x] **Step 2: Run the targeted TUI tests and verify they fail**

Run: `node --experimental-strip-types --test tests/tui/tui-state.test.ts tests/tui/run-interactive-tui.test.ts`
Expected: FAIL because the TUI state still appends whole assistant/execution items and unlocks on `ready`.

- [x] **Step 3: Migrate `runInteractiveTui()` and `reduceTuiState()` to use lifecycle-aware request and execution updates**

```ts
onInteractionEvent: (event) => {
  requestLedger = reduceRequestLedger(requestLedger, event);
  state = reduceTuiState(state, projectInteractionEventToTuiAction(event, requestLedger));
  state = reduceTuiState(state, {
    type: "set_input_locked",
    locked: isComposerLocked(requestLedger),
  });
  app.update(state);
};
```

Implementation notes:

- keep local `onDraftChange` / `onSubmit` behavior in the TUI app
- on submit, create the local user card immediately as today
- remove the old `runtimeState === streaming` shortcut as the source of truth for locking
- keep existing system-line handling for now
- project execution transcript buffers into timeline/view-model output without introducing nested scrolling

- [x] **Step 4: Re-run the targeted TUI tests and verify they pass**

Run: `node --experimental-strip-types --test tests/tui/tui-state.test.ts tests/tui/run-interactive-tui.test.ts`
Expected: PASS

## Task 5: Add The Runtime Loop Circuit Breaker

**Files:**
- Modify: `src/runtime/runtime-session.ts`
- Modify: `tests/runtime/session-manager.test.ts`

- [x] **Step 1: Write a failing runtime test for loop-limit termination**

```ts
test("runtime emits request_completed(error) with AGENT_LOOP_LIMIT_EXCEEDED when the loop cap is hit", async () => {
  const completed: Array<{ status: string; errorCode: string | null }> = [];
  const manager = new SessionManager({
    write: () => {},
    assistantStep: async () => ({
      kind: "tool_calls",
      responseId: `response-${Math.random()}`,
      plannedExecutionIds: ["execution-1"],
      usage: null,
    }),
    onInteractionEvent: (event) => {
      if (event.eventType === "request_completed") {
        completed.push({
          status: event.payload.status,
          errorCode: event.payload.errorCode,
        });
      }
    },
  });

  await manager.run(context);
  assert.deepEqual(completed, [
    { status: "error", errorCode: "AGENT_LOOP_LIMIT_EXCEEDED" },
  ]);
});
```

- [x] **Step 2: Run the targeted runtime test and verify it fails**

Run: `node --experimental-strip-types --test tests/runtime/session-manager.test.ts`
Expected: FAIL because `RuntimeSession` does not enforce a loop cap yet.

- [x] **Step 3: Implement `max_turn_limit` enforcement and request-level error closure**

```ts
const DEFAULT_MAX_TURN_LIMIT = 15;

if (this.requestTurnCount >= this.maxTurnLimit) {
  this.emitRequestCompleted({
    requestId,
    turnId,
    status: "error",
    errorCode: "AGENT_LOOP_LIMIT_EXCEEDED",
  });
  return;
}
```

Implementation notes:

- count loop iterations inside runtime only
- presenter code must not count or enforce the loop cap
- if the loop cap fires after an execution wave has been declared, close those execution ids before the terminal request event is emitted

- [x] **Step 4: Re-run the targeted runtime test and verify it passes**

Run: `node --experimental-strip-types --test tests/runtime/session-manager.test.ts`
Expected: PASS

## Task 6: Run Verification And Update Working Memory

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify: `plans/2026-03-26-interaction-runtime-foundation-plan.md`

- [x] **Step 1: Run the focused contract and TUI test suite**

Run: `node --experimental-strip-types --test tests/contracts/interaction-event-schema.test.ts tests/runtime/session-manager.test.ts tests/runtime/interactive-session.test.ts tests/tui/request-ledger.test.ts tests/tui/execution-transcript-buffer.test.ts tests/tui/tui-state.test.ts tests/tui/run-interactive-tui.test.ts`
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

- Keep the old renderer-neutral hooks alive during this pass where needed, but treat `onInteractionEvent` as the new primary integration boundary for presenters.
- Do not try to land provider-native streaming in the same patch. The compatibility adapter from one-shot assistant results to `started -> chunk -> completed` is sufficient for this foundation pass.
- Do not introduce nested execution-card scroll regions. Timeline scrolling remains the only scroll owner.
- Do not combine this plan with the new CLI routing / native stream presenter work. Those are separate product tracks now.
