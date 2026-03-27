import test from "node:test";
import assert from "node:assert/strict";

import { createStreamPresenter } from "../../src/cli/stream-presenter.ts";

const baseEvent = {
  timestamp: "2024-01-01T00:00:00.000Z",
  sessionId: "session-1",
  turnId: "turn-1",
  requestId: "request-1",
} as const;

test("stream presenter writes assistant output chunks to stdout", () => {
  let stdout = "";
  let stderr = "";
  const presenter = createStreamPresenter({
    writeStdout: (chunk) => {
      stdout += chunk;
    },
    writeStderr: (chunk) => {
      stderr += chunk;
    },
  });

  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "assistant_stream_chunk",
    payload: {
      responseId: "response-1",
      channel: "output_text",
      format: "markdown",
      delta: "Hello, ",
    },
  });
  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "assistant_stream_chunk",
    payload: {
      responseId: "response-1",
      channel: "output_text",
      format: "markdown",
      delta: "world!",
    },
  });

  assert.equal(stdout, "Hello, world!");
  assert.equal(stderr, "");
});

test("stream presenter appends a trailing newline when assistant output completes", () => {
  let stdout = "";
  let stderr = "";
  const presenter = createStreamPresenter({
    writeStdout: (chunk) => {
      stdout += chunk;
    },
    writeStderr: (chunk) => {
      stderr += chunk;
    },
  });

  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "assistant_response_started",
    payload: {
      responseId: "response-1",
    },
  });
  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "assistant_stream_chunk",
    payload: {
      responseId: "response-1",
      channel: "output_text",
      format: "markdown",
      delta: "Hello",
    },
  });
  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "assistant_response_completed",
    payload: {
      responseId: "response-1",
      finishReason: "stop",
      continuation: "none",
    },
  });

  assert.equal(stdout, "Hello\n");
  assert.equal(stderr, "");
});

test("stream presenter renders execution title and stdout chunk on stdout", () => {
  let stdout = "";
  let stderr = "";
  const presenter = createStreamPresenter({
    writeStdout: (chunk) => {
      stdout += chunk;
    },
    writeStderr: (chunk) => {
      stderr += chunk;
    },
  });

  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "execution_item_started",
    payload: {
      executionId: "exec-1",
      executionKind: "tool",
      title: "Run tests",
      origin: {
        source: "unit",
      },
    },
  });
  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "execution_item_chunk",
    payload: {
      executionId: "exec-1",
      stream: "stdout",
      output: "all green",
    },
  });

  assert.equal(stdout, "> Run tests\nall green");
  assert.equal(stderr, "");
});

test("stream presenter ignores reasoning chunks and routes execution stderr", () => {
  let stdout = "";
  let stderr = "";
  const presenter = createStreamPresenter({
    writeStdout: (chunk) => {
      stdout += chunk;
    },
    writeStderr: (chunk) => {
      stderr += chunk;
    },
  });

  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "assistant_stream_chunk",
    payload: {
      responseId: "response-2",
      channel: "reasoning_text",
      format: "plain_text",
      delta: "hidden",
    },
  });
  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "execution_item_started",
    payload: {
      executionId: "exec-1",
      executionKind: "tool",
      title: "Run tests",
      origin: {
        source: "unit",
      },
    },
  });
  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "execution_item_chunk",
    payload: {
      executionId: "exec-1",
      stream: "stderr",
      output: "error output",
    },
  });
  presenter.onSystemLine("system line");

  assert.equal(stdout, "> Run tests\nsystem line\n");
  assert.equal(stderr, "error output");
});

test("stream presenter writes request-level terminal errors to stderr", () => {
  let stdout = "";
  let stderr = "";
  const presenter = createStreamPresenter({
    writeStdout: (chunk) => {
      stdout += chunk;
    },
    writeStderr: (chunk) => {
      stderr += chunk;
    },
  });

  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "request_completed",
    payload: {
      status: "error",
      errorCode: "AGENT_LOOP_LIMIT_EXCEEDED",
    },
  });

  assert.equal(stdout, "");
  assert.match(stderr, /AGENT_LOOP_LIMIT_EXCEEDED/);
});
