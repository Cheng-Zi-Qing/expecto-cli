import test from "node:test";
import assert from "node:assert/strict";

import {
  assistantResponseStartedPayloadSchema,
  assistantStreamChunkPayloadSchema,
  assistantResponseCompletedPayloadSchema,
  executionStartedPayloadSchema,
  executionChunkPayloadSchema,
  executionCompletedPayloadSchema,
  requestSucceededPayloadSchema,
  requestFailedPayloadSchema,
  requestRejectedPayloadSchema,
  sessionStartedPayloadSchema,
  userPromptReceivedPayloadSchema,
} from "../../src/protocol/domain-event-payload-schema.ts";

type ParseResult = ReturnType<typeof assistantResponseCompletedPayloadSchema.safeParse>;

function assertIssueAtPath(
  result: ParseResult,
  path: string,
  messageIncludes?: string,
): void {
  assert.equal(result.success, false);

  const matchingIssues = result.error.issues.filter(
    (issue) => issue.path.join(".") === path,
  );
  assert.ok(matchingIssues.length > 0);

  if (messageIncludes) {
    assert.ok(
      matchingIssues.some((issue) => issue.message.includes(messageIncludes)),
      `expected parse issue at "${path}" containing "${messageIncludes}", got ${JSON.stringify(matchingIssues)}`,
    );
  }
}

test("assistant.stream_chunk payload accepts channel, format, and delta", () => {
  const parsed = assistantStreamChunkPayloadSchema.parse({
    responseId: "response-1",
    channel: "output_text",
    format: "markdown",
    delta: "Partial answer",
  });

  assert.equal(parsed.delta, "Partial answer");
});

test("assistant.response_started payload accepts responseId", () => {
  const parsed = assistantResponseStartedPayloadSchema.parse({
    responseId: "response-1",
  });

  assert.equal(parsed.responseId, "response-1");
});

test("assistant.response_completed payload accepts valid tool call fan-out", () => {
  const parsed = assistantResponseCompletedPayloadSchema.parse({
    responseId: "response-1",
    finishReason: "tool_calls",
    continuation: "awaiting_execution",
    plannedExecutionIds: ["exec-1", "exec-2"],
  });

  assert.deepEqual(parsed, {
    responseId: "response-1",
    finishReason: "tool_calls",
    continuation: "awaiting_execution",
    plannedExecutionIds: ["exec-1", "exec-2"],
  });
});

test("assistant.response_completed payload accepts optional usage and errorCode", () => {
  const parsed = assistantResponseCompletedPayloadSchema.parse({
    responseId: "response-2",
    finishReason: "error",
    continuation: "none",
    usage: {
      inputTokens: 42,
      outputTokens: 3,
    },
    errorCode: "provider_error",
  });

  assert.equal(parsed.finishReason, "error");
  assert.equal(parsed.errorCode, "provider_error");
});

test("assistant.response_completed payload requires plannedExecutionIds when finishReason is tool_calls", () => {
  const result = assistantResponseCompletedPayloadSchema.safeParse({
    responseId: "response-1",
    finishReason: "tool_calls",
    continuation: "awaiting_execution",
  });

  assertIssueAtPath(result, "plannedExecutionIds");
});

test("assistant.response_completed payload rejects duplicate plannedExecutionIds", () => {
  const result = assistantResponseCompletedPayloadSchema.safeParse({
    responseId: "response-1",
    finishReason: "tool_calls",
    continuation: "awaiting_execution",
    plannedExecutionIds: ["exec-1", "exec-1"],
  });

  assertIssueAtPath(result, "plannedExecutionIds", "de-duplicated");
});

test("execution.chunk payload accepts stream output", () => {
  const parsed = executionChunkPayloadSchema.parse({
    executionId: "exec-1",
    stream: "stdout",
    output: "Running command...",
  });

  assert.equal(parsed.stream, "stdout");
});

test("execution.started payload accepts required fields", () => {
  const parsed = executionStartedPayloadSchema.parse({
    executionId: "exec-1",
    executionKind: "command",
    title: "Run tests",
    origin: {
      source: "assistant",
    },
  });

  assert.equal(parsed.executionKind, "command");
});

test("execution.completed payload accepts optional exitCode and errorCode", () => {
  const parsed = executionCompletedPayloadSchema.parse({
    executionId: "exec-2",
    status: "error",
    summary: "Command failed",
    exitCode: 2,
    errorCode: "command_failed",
  });

  assert.equal(parsed.exitCode, 2);
  assert.equal(parsed.errorCode, "command_failed");
});

test("execution.completed payload rejects multiline summary", () => {
  assert.throws(
    () =>
      executionCompletedPayloadSchema.parse({
        executionId: "exec-1",
        status: "error",
        summary: "line one\nline two",
        errorCode: "command_failed",
      }),
    /single line/,
  );
});

test("request terminal payloads follow canonical three-way split", () => {
  assert.deepEqual(requestSucceededPayloadSchema.parse({}), {});
  assert.equal(
    requestFailedPayloadSchema.parse({
      code: "INTERRUPTED",
      message: "generation interrupted",
      retryable: false,
    }).code,
    "INTERRUPTED",
  );
  assert.equal(
    requestRejectedPayloadSchema.parse({
      code: "POLICY_BLOCKED",
      message: "blocked by policy",
      retryable: false,
    }).code,
    "POLICY_BLOCKED",
  );
});

test("session.started payload accepts canonical mode and entryKind", () => {
  const parsed = sessionStartedPayloadSchema.parse({
    mode: "balanced",
    entryKind: "interactive",
  });

  assert.equal(parsed.entryKind, "interactive");
});

test("user.prompt_received payload accepts a prompt", () => {
  const parsed = userPromptReceivedPayloadSchema.parse({
    prompt: "inspect auth flow",
  });

  assert.equal(parsed.prompt, "inspect auth flow");
});

test("payload enum surfaces accept reasoning_text, tool/system kinds, and interrupted status", () => {
  assert.equal(
    assistantStreamChunkPayloadSchema.parse({
      responseId: "response-enum",
      channel: "reasoning_text",
      format: "plain_text",
      delta: "thinking...",
    }).channel,
    "reasoning_text",
  );

  assert.equal(
    executionStartedPayloadSchema.parse({
      executionId: "exec-kind-tool",
      executionKind: "tool",
      title: "Execution task",
      origin: { source: "assistant" },
    }).executionKind,
    "tool",
  );

  assert.equal(
    executionStartedPayloadSchema.parse({
      executionId: "exec-kind-system",
      executionKind: "system",
      title: "Execution task",
      origin: { source: "assistant" },
    }).executionKind,
    "system",
  );

  assert.equal(
    executionChunkPayloadSchema.parse({
      executionId: "exec-stream-system",
      stream: "system",
      output: "log",
    }).stream,
    "system",
  );

  assert.equal(
    executionCompletedPayloadSchema.parse({
      executionId: "exec-status-interrupted",
      status: "interrupted",
      summary: "Interrupted",
    }).status,
    "interrupted",
  );
});
