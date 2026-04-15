import test from "node:test";
import assert from "node:assert/strict";

import type { DomainEvent } from "../../src/protocol/domain-event-schema.ts";
import { createStreamPresenter } from "../../src/cli/stream-presenter.ts";

let eventSequence = 0;

function makeDomainEvent(
  eventType: string,
  payload: Record<string, unknown>,
  causation?: { requestId: string },
): DomainEvent {
  eventSequence += 1;
  return {
    protocolVersion: "1.0",
    eventId: `evt-${eventSequence}`,
    sessionId: "session-1",
    eventType,
    sequence: eventSequence,
    timestamp: "2024-01-01T00:00:00.000Z",
    ...(causation ? { causation } : {}),
    payload,
  };
}

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

  presenter.onDomainEvent(makeDomainEvent(
    "assistant.stream_chunk",
    {
      responseId: "response-1",
      channel: "output_text",
      format: "markdown",
      delta: "Hello, ",
    },
    { requestId: "request-1" },
  ));
  presenter.onDomainEvent(makeDomainEvent(
    "assistant.stream_chunk",
    {
      responseId: "response-1",
      channel: "output_text",
      format: "markdown",
      delta: "world!",
    },
    { requestId: "request-1" },
  ));

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

  presenter.onDomainEvent(makeDomainEvent(
    "assistant.response_started",
    { responseId: "response-1" },
    { requestId: "request-1" },
  ));
  presenter.onDomainEvent(makeDomainEvent(
    "assistant.stream_chunk",
    {
      responseId: "response-1",
      channel: "output_text",
      format: "markdown",
      delta: "Hello",
    },
    { requestId: "request-1" },
  ));
  presenter.onDomainEvent(makeDomainEvent(
    "assistant.response_completed",
    {
      responseId: "response-1",
      finishReason: "stop",
      continuation: "none",
    },
    { requestId: "request-1" },
  ));

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

  presenter.onDomainEvent(makeDomainEvent(
    "execution.started",
    {
      executionId: "exec-1",
      executionKind: "tool",
      title: "Run tests",
      origin: { source: "unit" },
    },
    { requestId: "request-1" },
  ));
  presenter.onDomainEvent(makeDomainEvent(
    "execution.chunk",
    {
      executionId: "exec-1",
      stream: "stdout",
      output: "all green",
    },
    { requestId: "request-1" },
  ));

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

  presenter.onDomainEvent(makeDomainEvent(
    "assistant.stream_chunk",
    {
      responseId: "response-2",
      channel: "reasoning_text",
      format: "plain_text",
      delta: "hidden",
    },
    { requestId: "request-1" },
  ));
  presenter.onDomainEvent(makeDomainEvent(
    "execution.started",
    {
      executionId: "exec-1",
      executionKind: "tool",
      title: "Run tests",
      origin: { source: "unit" },
    },
    { requestId: "request-1" },
  ));
  presenter.onDomainEvent(makeDomainEvent(
    "execution.chunk",
    {
      executionId: "exec-1",
      stream: "stderr",
      output: "error output",
    },
    { requestId: "request-1" },
  ));

  assert.equal(stdout, "> Run tests\n");
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

  presenter.onDomainEvent(makeDomainEvent(
    "request.failed",
    {
      code: "AGENT_LOOP_LIMIT_EXCEEDED",
      message: "Agent loop limit exceeded",
    },
    { requestId: "request-1" },
  ));

  assert.equal(stdout, "");
  assert.match(stderr, /AGENT_LOOP_LIMIT_EXCEEDED/);
});
