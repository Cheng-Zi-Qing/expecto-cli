import test from "node:test";
import assert from "node:assert/strict";

import {
  interactionEventSchema,
  type InteractionEvent,
} from "../../src/contracts/interaction-event-schema.ts";

const baseEnvelope = {
  timestamp: "2026-03-26T10:00:00.000Z",
  sessionId: "session-1",
  turnId: "turn-1",
  requestId: "request-1",
};

type InteractionEventParseResult = ReturnType<typeof interactionEventSchema.safeParse>;

function assertIssueAtPath(
  result: InteractionEventParseResult,
  path: string,
  messageIncludes?: string,
): void {
  assert.equal(result.success, false);

  const matchingIssues = result.error.issues.filter(
    (issue) => issue.path.join(".") === path,
  );
  assert.ok(
    matchingIssues.length > 0,
    `expected parse issue at path "${path}", got ${JSON.stringify(result.error.issues)}`,
  );

  if (messageIncludes) {
    assert.ok(
      matchingIssues.some((issue) => issue.message.includes(messageIncludes)),
      `expected parse issue at "${path}" containing "${messageIncludes}", got ${JSON.stringify(matchingIssues)}`,
    );
  }
}

function assertUnrecognizedKey(
  result: InteractionEventParseResult,
  path: string,
  key: string,
): void {
  assert.equal(result.success, false);

  const matchingIssues = result.error.issues.filter((issue) => {
    if (issue.code !== "unrecognized_keys") {
      return false;
    }

    if (issue.path.join(".") !== path) {
      return false;
    }

    const issueWithKeys = issue as typeof issue & { keys?: string[] };
    return Array.isArray(issueWithKeys.keys) && issueWithKeys.keys.includes(key);
  });

  assert.ok(
    matchingIssues.length > 0,
    `expected unrecognized key "${key}" at "${path}", got ${JSON.stringify(result.error.issues)}`,
  );
}

function assertEventType<TEventType extends InteractionEvent["eventType"]>(
  event: InteractionEvent,
  eventType: TEventType,
): asserts event is Extract<InteractionEvent, { eventType: TEventType }> {
  assert.equal(event.eventType, eventType);
}

test("assistant stream chunk accepts channel, format, and delta payload", () => {
  const parsed = interactionEventSchema.parse({
    ...baseEnvelope,
    eventType: "assistant_stream_chunk",
    payload: {
      responseId: "response-1",
      channel: "output_text",
      format: "markdown",
      delta: "Partial answer",
    },
  });

  assertEventType(parsed, "assistant_stream_chunk");
  assert.equal(parsed.payload.delta, "Partial answer");
});

test("assistant response started accepts responseId payload", () => {
  const parsed = interactionEventSchema.parse({
    ...baseEnvelope,
    eventType: "assistant_response_started",
    payload: {
      responseId: "response-1",
    },
  });

  assertEventType(parsed, "assistant_response_started");
  assert.equal(parsed.payload.responseId, "response-1");
});

test("assistant completion accepts valid tool call fan-out payload", () => {
  const parsed = interactionEventSchema.parse({
    ...baseEnvelope,
    eventType: "assistant_response_completed",
    payload: {
      responseId: "response-1",
      finishReason: "tool_calls",
      continuation: "awaiting_execution",
      plannedExecutionIds: ["exec-1", "exec-2"],
    },
  });

  assertEventType(parsed, "assistant_response_completed");
  assert.deepEqual(parsed.payload, {
    responseId: "response-1",
    finishReason: "tool_calls",
    continuation: "awaiting_execution",
    plannedExecutionIds: ["exec-1", "exec-2"],
  });
});

test("assistant completion accepts optional usage and errorCode", () => {
  const parsed = interactionEventSchema.parse({
    ...baseEnvelope,
    eventType: "assistant_response_completed",
    payload: {
      responseId: "response-2",
      finishReason: "error",
      continuation: "none",
      usage: {
        inputTokens: 42,
        outputTokens: 3,
      },
      errorCode: "provider_error",
    },
  });

  assertEventType(parsed, "assistant_response_completed");
  assert.deepEqual(parsed.payload, {
    responseId: "response-2",
    finishReason: "error",
    continuation: "none",
    usage: {
      inputTokens: 42,
      outputTokens: 3,
    },
    errorCode: "provider_error",
  });
});

test("assistant completion requires plannedExecutionIds when finishReason is tool_calls", () => {
  const result = interactionEventSchema.safeParse({
    ...baseEnvelope,
    eventType: "assistant_response_completed",
    payload: {
      responseId: "response-1",
      finishReason: "tool_calls",
      continuation: "awaiting_execution",
    },
  });

  assertIssueAtPath(result, "payload.plannedExecutionIds");
});

test("assistant completion rejects empty plannedExecutionIds for tool calls", () => {
  const result = interactionEventSchema.safeParse({
    ...baseEnvelope,
    eventType: "assistant_response_completed",
    payload: {
      responseId: "response-1",
      finishReason: "tool_calls",
      continuation: "awaiting_execution",
      plannedExecutionIds: [],
    },
  });

  assertIssueAtPath(result, "payload.plannedExecutionIds", "non-empty");
});

test("assistant completion rejects duplicate plannedExecutionIds", () => {
  const result = interactionEventSchema.safeParse({
    ...baseEnvelope,
    eventType: "assistant_response_completed",
    payload: {
      responseId: "response-1",
      finishReason: "tool_calls",
      continuation: "awaiting_execution",
      plannedExecutionIds: ["exec-1", "exec-1"],
    },
  });

  assertIssueAtPath(result, "payload.plannedExecutionIds", "de-duplicated");
});

test("assistant completion rejects plannedExecutionIds when finishReason is not tool_calls", () => {
  const result = interactionEventSchema.safeParse({
    ...baseEnvelope,
    eventType: "assistant_response_completed",
    payload: {
      responseId: "response-1",
      finishReason: "stop",
      continuation: "none",
      plannedExecutionIds: ["exec-1"],
    },
  });

  assertUnrecognizedKey(result, "payload", "plannedExecutionIds");
});

test("assistant completion enforces continuation for tool call fan-out", () => {
  const result = interactionEventSchema.safeParse({
    ...baseEnvelope,
    eventType: "assistant_response_completed",
    payload: {
      responseId: "response-1",
      finishReason: "tool_calls",
      continuation: "none",
      plannedExecutionIds: ["exec-1"],
    },
  });

  assertIssueAtPath(result, "payload.continuation");
});

test("execution item chunk accepts stream output payload", () => {
  const parsed = interactionEventSchema.parse({
    ...baseEnvelope,
    eventType: "execution_item_chunk",
    payload: {
      executionId: "exec-1",
      stream: "stdout",
      output: "Running command...",
    },
  });

  assertEventType(parsed, "execution_item_chunk");
  assert.equal(parsed.payload.stream, "stdout");
});

test("execution item started accepts required payload", () => {
  const parsed = interactionEventSchema.parse({
    ...baseEnvelope,
    eventType: "execution_item_started",
    payload: {
      executionId: "exec-1",
      executionKind: "command",
      title: "Run tests",
      origin: {
        source: "assistant",
      },
    },
  });

  assertEventType(parsed, "execution_item_started");
  assert.equal(parsed.payload.executionKind, "command");
});

test("execution item completed accepts optional exitCode and errorCode", () => {
  const parsed = interactionEventSchema.parse({
    ...baseEnvelope,
    eventType: "execution_item_completed",
    payload: {
      executionId: "exec-2",
      status: "error",
      summary: "Command failed",
      exitCode: 2,
      errorCode: "command_failed",
    },
  });

  assertEventType(parsed, "execution_item_completed");
  assert.equal(parsed.payload.exitCode, 2);
  assert.equal(parsed.payload.errorCode, "command_failed");
});

test("execution completion rejects multiline summary", () => {
  const result = interactionEventSchema.safeParse({
    ...baseEnvelope,
    eventType: "execution_item_completed",
    payload: {
      executionId: "exec-1",
      status: "error",
      summary: "line one\nline two",
      errorCode: "command_failed",
    },
  });

  assertIssueAtPath(result, "payload.summary", "single line");
});

test("execution started requires structured origin object", () => {
  const result = interactionEventSchema.safeParse({
    ...baseEnvelope,
    eventType: "execution_item_started",
    payload: {
      executionId: "exec-1",
      executionKind: "command",
      title: "Run tests",
      origin: {},
    },
  });

  assertIssueAtPath(result, "payload.origin", "non-empty");
});

test("request completed accepts terminal status and optional errorCode", () => {
  const parsed = interactionEventSchema.parse({
    ...baseEnvelope,
    eventType: "request_completed",
    payload: {
      status: "error",
      errorCode: "runtime_error",
    },
  });

  assertEventType(parsed, "request_completed");
  assert.equal(parsed.payload.status, "error");
});

test("session_initialized accepts a session-level payload without turn metadata", () => {
  const parsed = interactionEventSchema.parse({
    timestamp: "2026-03-26T10:00:00.000Z",
    sessionId: "session-1",
    eventType: "session_initialized",
    payload: {
      sessionId: "session-1",
    },
  });

  assertEventType(parsed, "session_initialized");
  assert.equal(parsed.payload.sessionId, "session-1");
});

test("user_prompt_received accepts a turn-scoped prompt payload", () => {
  const parsed = interactionEventSchema.parse({
    ...baseEnvelope,
    eventType: "user_prompt_received",
    payload: {
      prompt: "inspect auth flow",
    },
  });

  assertEventType(parsed, "user_prompt_received");
  assert.equal(parsed.payload.prompt, "inspect auth flow");
});

test("interaction events require envelope fields on every event", () => {
  const result = interactionEventSchema.safeParse({
    timestamp: "2026-03-26T10:00:00.000Z",
    sessionId: "session-1",
    requestId: "request-1",
    eventType: "assistant_response_started",
    payload: {
      responseId: "response-1",
    },
  });

  assertIssueAtPath(result, "turnId");
});

test("assistant enum surface accepts reasoning_text and plain_text", () => {
  const parsed = interactionEventSchema.parse({
    ...baseEnvelope,
    eventType: "assistant_stream_chunk",
    payload: {
      responseId: "response-enum",
      channel: "reasoning_text",
      format: "plain_text",
      delta: "thinking...",
    },
  });
  assertEventType(parsed, "assistant_stream_chunk");
  assert.equal(parsed.payload.channel, "reasoning_text");
  assert.equal(parsed.payload.format, "plain_text");
});

test("assistant completion enum surface accepts remaining non-tool finish reasons", () => {
  for (const finishReason of [
    "max_tokens",
    "interrupted",
    "error",
    "content_filter",
  ] as const) {
    const parsed = interactionEventSchema.parse({
      ...baseEnvelope,
      eventType: "assistant_response_completed",
      payload: {
        responseId: `response-${finishReason}`,
        finishReason,
        continuation: "none",
      },
    });
    assertEventType(parsed, "assistant_response_completed");
    assert.equal(parsed.payload.finishReason, finishReason);
  }
});

test("execution kind enum surface accepts tool and system", () => {
  for (const executionKind of ["tool", "system"] as const) {
    const parsed = interactionEventSchema.parse({
      ...baseEnvelope,
      eventType: "execution_item_started",
      payload: {
        executionId: `exec-kind-${executionKind}`,
        executionKind,
        title: "Execution task",
        origin: {
          source: "assistant",
        },
      },
    });
    assertEventType(parsed, "execution_item_started");
    assert.equal(parsed.payload.executionKind, executionKind);
  }
});

test("execution stream enum surface accepts stderr and system", () => {
  for (const stream of ["stderr", "system"] as const) {
    const parsed = interactionEventSchema.parse({
      ...baseEnvelope,
      eventType: "execution_item_chunk",
      payload: {
        executionId: `exec-stream-${stream}`,
        stream,
        output: "log",
      },
    });
    assertEventType(parsed, "execution_item_chunk");
    assert.equal(parsed.payload.stream, stream);
  }
});

test("execution status enum surface accepts success and interrupted", () => {
  for (const status of ["success", "interrupted"] as const) {
    const parsed = interactionEventSchema.parse({
      ...baseEnvelope,
      eventType: "execution_item_completed",
      payload: {
        executionId: `exec-status-${status}`,
        status,
        summary: "Completed",
      },
    });
    assertEventType(parsed, "execution_item_completed");
    assert.equal(parsed.payload.status, status);
  }
});

test("request terminal status enum surface accepts completed and interrupted", () => {
  for (const status of ["completed", "interrupted"] as const) {
    const parsed = interactionEventSchema.parse({
      ...baseEnvelope,
      eventType: "request_completed",
      payload: {
        status,
      },
    });
    assertEventType(parsed, "request_completed");
    assert.equal(parsed.payload.status, status);
  }
});
