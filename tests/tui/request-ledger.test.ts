import test from "node:test";
import assert from "node:assert/strict";

import {
  createForegroundRequestLedger,
  isComposerLocked,
  markInterruptRequested,
  reduceRequestLedger,
} from "../../src/tui/request-ledger.ts";
import type {
  ExecutionStatus,
  InteractionEvent,
  RequestCompletedStatus,
} from "../../src/contracts/interaction-event-schema.ts";

const baseEnvelope = {
  timestamp: "2026-03-26T10:00:00.000Z",
  sessionId: "session-1",
  turnId: "turn-1",
} as const;

function createEvent<TEventType extends InteractionEvent["eventType"]>(
  input: {
    requestId?: string;
    eventType: TEventType;
    payload: Extract<InteractionEvent, { eventType: TEventType }>["payload"];
  },
): Extract<InteractionEvent, { eventType: TEventType }> {
  return {
    ...baseEnvelope,
    requestId: input.requestId ?? "request-1",
    eventType: input.eventType,
    payload: input.payload,
  } as Extract<InteractionEvent, { eventType: TEventType }>;
}

function assistantResponseStarted(requestId: string, responseId: string): InteractionEvent {
  return createEvent({
    requestId,
    eventType: "assistant_response_started",
    payload: { responseId },
  });
}

function assistantResponseCompletedToolCalls(
  requestId: string,
  responseId: string,
  plannedExecutionIds: string[],
): InteractionEvent {
  return createEvent({
    requestId,
    eventType: "assistant_response_completed",
    payload: {
      responseId,
      finishReason: "tool_calls",
      continuation: "awaiting_execution",
      plannedExecutionIds,
    },
  });
}

function executionItemStarted(requestId: string, executionId: string): InteractionEvent {
  return createEvent({
    requestId,
    eventType: "execution_item_started",
    payload: {
      executionId,
      executionKind: "command",
      title: `run ${executionId}`,
      origin: {
        source: "assistant",
      },
    },
  });
}

function executionItemCompleted(
  requestId: string,
  executionId: string,
  status: ExecutionStatus,
): InteractionEvent {
  return createEvent({
    requestId,
    eventType: "execution_item_completed",
    payload: {
      executionId,
      status,
      summary: `${executionId} ${status}`,
    },
  });
}

function requestCompleted(requestId: string, status: RequestCompletedStatus): InteractionEvent {
  return createEvent({
    requestId,
    eventType: "request_completed",
    payload: { status },
  });
}

function snapshotLedger(ledger: ReturnType<typeof createForegroundRequestLedger>): {
  requestId: string;
  turnId: string;
  startedAt: string;
  activeResponseId: string | null;
  currentExecutionWave: {
    planned: string[];
    started: string[];
    completed: string[];
    failed: string[];
    interrupted: string[];
  } | null;
  interruptRequested: boolean;
  terminalEventReceived: boolean;
  terminalStatus: RequestCompletedStatus | null;
  phase: string;
  assistantStarted: boolean;
} {
  return {
    requestId: ledger.requestId,
    turnId: ledger.turnId,
    startedAt: ledger.startedAt,
    activeResponseId: ledger.activeResponseId,
    currentExecutionWave: ledger.currentExecutionWave === null
      ? null
      : {
          planned: [...ledger.currentExecutionWave.planned],
          started: [...ledger.currentExecutionWave.started],
          completed: [...ledger.currentExecutionWave.completed],
          failed: [...ledger.currentExecutionWave.failed],
          interrupted: [...ledger.currentExecutionWave.interrupted],
        },
    interruptRequested: ledger.interruptRequested,
    terminalEventReceived: ledger.terminalEventReceived,
    terminalStatus: ledger.terminalStatus,
    phase: ledger.phase,
    assistantStarted: ledger.assistantStarted,
  };
}

if (false) {
  const ledger = createForegroundRequestLedger({
    requestId: "request-readonly",
    turnId: "turn-readonly",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  if (ledger.currentExecutionWave !== null) {
    // @ts-expect-error request-ledger wave sets are read-only at the public boundary
    ledger.currentExecutionWave.planned.add("execution-mutation");
  }
}

test("request ledger stays locked until matching request_completed even after all planned ids finish", () => {
  const requestId = "request-1";
  let ledger = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  assert.equal(isComposerLocked(ledger), true);

  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-1"));
  assert.equal(ledger.phase, "assistant_active");
  assert.equal(ledger.activeResponseId, "response-1");

  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", [
      "execution-1",
      "execution-2",
      "execution-3",
    ]),
  );

  assert.equal(ledger.phase, "awaiting_execution_start");
  assert.equal(isComposerLocked(ledger), true);
  const plannedWave = ledger.currentExecutionWave;
  assert.ok(plannedWave);
  assert.deepEqual([...plannedWave.planned], [
    "execution-1",
    "execution-2",
    "execution-3",
  ]);

  ledger = reduceRequestLedger(ledger, executionItemStarted(requestId, "execution-1"));
  ledger = reduceRequestLedger(ledger, executionItemStarted(requestId, "execution-2"));
  ledger = reduceRequestLedger(ledger, executionItemStarted(requestId, "execution-3"));
  assert.equal(ledger.phase, "executing");
  const executingWave = ledger.currentExecutionWave;
  assert.ok(executingWave);
  assert.deepEqual([...executingWave.started], [
    "execution-1",
    "execution-2",
    "execution-3",
  ]);

  ledger = reduceRequestLedger(
    ledger,
    executionItemCompleted(requestId, "execution-1", "success"),
  );
  ledger = reduceRequestLedger(ledger, executionItemCompleted(requestId, "execution-2", "error"));
  ledger = reduceRequestLedger(
    ledger,
    executionItemCompleted(requestId, "execution-3", "interrupted"),
  );

  assert.equal(ledger.phase, "awaiting_assistant_resume");
  assert.equal(isComposerLocked(ledger), true);
  const completedWave = ledger.currentExecutionWave;
  assert.ok(completedWave);
  assert.deepEqual([...completedWave.completed], [
    "execution-1",
    "execution-2",
    "execution-3",
  ]);
  assert.deepEqual([...completedWave.failed], ["execution-2"]);
  assert.deepEqual([...completedWave.interrupted], ["execution-3"]);

  ledger = reduceRequestLedger(ledger, requestCompleted(requestId, "error"));
  assert.equal(ledger.phase, "terminal");
  assert.equal(ledger.terminalEventReceived, true);
  assert.equal(ledger.terminalStatus, "error");
  assert.equal(isComposerLocked(ledger), false);
});

test("request ledger marks interrupt intent and stays locked until request completion", () => {
  const requestId = "request-1";
  const initial = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T12:00:00.000Z",
  });

  const interrupting = markInterruptRequested(initial);

  assert.equal(interrupting.interruptRequested, true);
  assert.equal(interrupting.phase, "interrupting");
  assert.equal(isComposerLocked(interrupting), true);

  const terminal = reduceRequestLedger(
    interrupting,
    requestCompleted(requestId, "interrupted"),
  );

  assert.equal(terminal.phase, "terminal");
  assert.equal(terminal.terminalStatus, "interrupted");
  assert.equal(isComposerLocked(terminal), false);
});

test("request ledger ignores execution events for ids outside the declared execution wave", () => {
  const requestId = "request-1";
  let ledger = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });
  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-1"));
  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", ["execution-1"]),
  );
  const initialWave = ledger.currentExecutionWave;
  assert.ok(initialWave);
  assert.deepEqual([...initialWave.planned], ["execution-1"]);
  const declaredWaveSnapshot = snapshotLedger(ledger);

  const afterUnknownStart = reduceRequestLedger(
    ledger,
    executionItemStarted(requestId, "execution-outside"),
  );
  assert.deepEqual(snapshotLedger(afterUnknownStart), declaredWaveSnapshot);

  const afterUnknownCompleted = reduceRequestLedger(
    ledger,
    executionItemCompleted(requestId, "execution-outside", "success"),
  );
  assert.deepEqual(snapshotLedger(afterUnknownCompleted), declaredWaveSnapshot);

  const afterKnownStart = reduceRequestLedger(
    ledger,
    executionItemStarted(requestId, "execution-1"),
  );
  const knownWave = afterKnownStart.currentExecutionWave;
  assert.ok(knownWave);
  assert.deepEqual([...knownWave.started], ["execution-1"]);
});

test("request ledger ignores duplicate execution start for an already-started planned id", () => {
  const requestId = "request-1";
  let ledger = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });
  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-1"));
  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", ["execution-1"]),
  );
  ledger = reduceRequestLedger(ledger, executionItemStarted(requestId, "execution-1"));

  const startedSnapshot = snapshotLedger(ledger);
  const afterDuplicateStart = reduceRequestLedger(
    ledger,
    executionItemStarted(requestId, "execution-1"),
  );

  assert.deepEqual(snapshotLedger(afterDuplicateStart), startedSnapshot);
});

test("request ledger ignores mismatched request ids and remains locked for the active request", () => {
  let ledger = createForegroundRequestLedger({
    requestId: "request-1",
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  ledger = reduceRequestLedger(ledger, requestCompleted("request-2", "completed"));
  assert.equal(ledger.terminalEventReceived, false);
  assert.equal(isComposerLocked(ledger), true);
});

test("request ledger ignores stale assistant completion when a newer response is active", () => {
  const requestId = "request-1";
  let ledger = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-1"));
  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-2"));

  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", ["execution-stale"]),
  );

  assert.equal(ledger.activeResponseId, "response-2");
  assert.equal(ledger.phase, "assistant_active");
  assert.equal(ledger.currentExecutionWave, null);
});

test("request ledger does not replace current execution wave from duplicate stale completion", () => {
  const requestId = "request-1";
  let ledger = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-1"));
  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", ["execution-old"]),
  );
  ledger = reduceRequestLedger(ledger, executionItemStarted(requestId, "execution-old"));
  ledger = reduceRequestLedger(
    ledger,
    executionItemCompleted(requestId, "execution-old", "success"),
  );
  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-2"));
  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-2", ["execution-new"]),
  );
  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", ["execution-stale"]),
  );

  const currentWave = ledger.currentExecutionWave;
  assert.ok(currentWave);
  assert.deepEqual([...currentWave.planned], ["execution-new"]);
});

test("assistant response started preserves an in-flight execution wave", () => {
  const requestId = "request-1";
  let ledger = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-1"));
  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", [
      "execution-1",
      "execution-2",
    ]),
  );
  ledger = reduceRequestLedger(ledger, executionItemStarted(requestId, "execution-1"));

  const beforeDuplicateStart = ledger.currentExecutionWave;
  assert.ok(beforeDuplicateStart);
  assert.deepEqual([...beforeDuplicateStart.planned], ["execution-1", "execution-2"]);
  assert.deepEqual([...beforeDuplicateStart.started], ["execution-1"]);
  assert.equal(ledger.activeResponseId, null);
  assert.equal(ledger.phase, "executing");

  ledger = reduceRequestLedger(
    ledger,
    assistantResponseStarted(requestId, "response-duplicate"),
  );

  const afterDuplicateStart = ledger.currentExecutionWave;
  assert.ok(afterDuplicateStart);
  assert.deepEqual([...afterDuplicateStart.planned], ["execution-1", "execution-2"]);
  assert.deepEqual([...afterDuplicateStart.started], ["execution-1"]);
  assert.equal(ledger.activeResponseId, null);
  assert.equal(ledger.phase, "executing");

  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-duplicate", ["execution-stale"]),
  );

  const afterStaleCompletion = ledger.currentExecutionWave;
  assert.ok(afterStaleCompletion);
  assert.deepEqual([...afterStaleCompletion.planned], ["execution-1", "execution-2"]);
  assert.deepEqual([...afterStaleCompletion.started], ["execution-1"]);
  assert.equal(ledger.activeResponseId, null);
  assert.equal(ledger.phase, "executing");
});

test("request ledger is immutable after request_completed for later assistant and execution events", () => {
  const requestId = "request-1";
  let ledger = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-1"));
  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", ["execution-1"]),
  );
  ledger = reduceRequestLedger(ledger, requestCompleted(requestId, "error"));

  assert.equal(ledger.terminalEventReceived, true);
  assert.equal(ledger.phase, "terminal");
  const terminalSnapshot = snapshotLedger(ledger);

  const afterLateAssistant = reduceRequestLedger(
    ledger,
    assistantResponseStarted(requestId, "late-response"),
  );
  assert.deepEqual(snapshotLedger(afterLateAssistant), terminalSnapshot);

  const afterLateExecutionStart = reduceRequestLedger(
    ledger,
    executionItemStarted(requestId, "execution-1"),
  );
  assert.deepEqual(snapshotLedger(afterLateExecutionStart), terminalSnapshot);

  const afterLateExecutionCompleted = reduceRequestLedger(
    ledger,
    executionItemCompleted(requestId, "execution-1", "success"),
  );
  assert.deepEqual(snapshotLedger(afterLateExecutionCompleted), terminalSnapshot);
});

test("request ledger ignores duplicate execution completion for an already-terminal execution id", () => {
  const requestId = "request-1";
  let ledger = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-1"));
  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", ["execution-1"]),
  );
  ledger = reduceRequestLedger(
    ledger,
    executionItemCompleted(requestId, "execution-1", "success"),
  );

  const afterFirstCompletion = ledger;
  const firstWave = afterFirstCompletion.currentExecutionWave;
  assert.ok(firstWave);
  assert.deepEqual([...firstWave.completed], ["execution-1"]);
  assert.deepEqual([...firstWave.failed], []);
  assert.deepEqual([...firstWave.interrupted], []);
  assert.equal(afterFirstCompletion.phase, "awaiting_assistant_resume");
  const firstCompletionSnapshot = snapshotLedger(afterFirstCompletion);

  ledger = reduceRequestLedger(
    ledger,
    executionItemCompleted(requestId, "execution-1", "error"),
  );

  const finalWave = ledger.currentExecutionWave;
  assert.ok(finalWave);
  assert.deepEqual([...finalWave.completed], ["execution-1"]);
  assert.deepEqual([...finalWave.failed], []);
  assert.deepEqual([...finalWave.interrupted], []);
  assert.equal(ledger.phase, "awaiting_assistant_resume");
  assert.deepEqual(snapshotLedger(ledger), firstCompletionSnapshot);
});

test("request ledger derives awaiting_assistant_resume when a full planned wave completes before any start", () => {
  const requestId = "request-1";
  let ledger = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-1"));
  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", ["execution-1"]),
  );
  ledger = reduceRequestLedger(
    ledger,
    executionItemCompleted(requestId, "execution-1", "success"),
  );

  const wave = ledger.currentExecutionWave;
  assert.ok(wave);
  assert.deepEqual([...wave.started], []);
  assert.deepEqual([...wave.completed], ["execution-1"]);
  assert.equal(ledger.phase, "awaiting_assistant_resume");
});

test("request ledger ignores late execution start when completion already finished the planned wave", () => {
  const requestId = "request-1";
  let ledger = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-1"));
  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", ["execution-1"]),
  );
  ledger = reduceRequestLedger(
    ledger,
    executionItemCompleted(requestId, "execution-1", "success"),
  );

  assert.equal(ledger.phase, "awaiting_assistant_resume");
  const beforeLateStartSnapshot = snapshotLedger(ledger);
  const afterLateStart = reduceRequestLedger(
    ledger,
    executionItemStarted(requestId, "execution-1"),
  );

  assert.deepEqual(snapshotLedger(afterLateStart), beforeLateStartSnapshot);
  const wave = afterLateStart.currentExecutionWave;
  assert.ok(wave);
  assert.deepEqual([...wave.started], []);
  assert.deepEqual([...wave.completed], ["execution-1"]);
  assert.equal(afterLateStart.phase, "awaiting_assistant_resume");
});

test("request ledger derives executing when part of a planned wave completes before any start", () => {
  const requestId = "request-1";
  let ledger = createForegroundRequestLedger({
    requestId,
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  ledger = reduceRequestLedger(ledger, assistantResponseStarted(requestId, "response-1"));
  ledger = reduceRequestLedger(
    ledger,
    assistantResponseCompletedToolCalls(requestId, "response-1", [
      "execution-1",
      "execution-2",
    ]),
  );
  ledger = reduceRequestLedger(
    ledger,
    executionItemCompleted(requestId, "execution-1", "success"),
  );

  const wave = ledger.currentExecutionWave;
  assert.ok(wave);
  assert.deepEqual([...wave.started], []);
  assert.deepEqual([...wave.completed], ["execution-1"]);
  assert.equal(ledger.phase, "executing");
});
