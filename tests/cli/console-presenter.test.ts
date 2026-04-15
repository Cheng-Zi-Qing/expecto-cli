import assert from "node:assert/strict";
import test from "node:test";

import type { DomainEvent } from "../../src/protocol/domain-event-schema.ts";
import { createConsolePresenter } from "../../src/cli/console-presenter.ts";

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

function createSurface() {
  const timeline: Array<{ text: string; stream: "stdout" | "stderr" }> = [];
  const status: string[] = [];

  return {
    timeline,
    status,
    surface: {
      appendTimelineText: (text: string, stream: "stdout" | "stderr" = "stdout") => {
        timeline.push({ text, stream });
      },
      setActiveStatus: (text: string) => {
        status.push(`set:${text}`);
      },
      clearActiveStatus: () => {
        status.push("clear");
      },
    },
  };
}

test("console presenter appends assistant and execution chunks directly to immutable timeline output", () => {
  const { timeline, surface } = createSurface();
  const presenter = createConsolePresenter({ surface });

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
      delta: "hello",
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

  assert.deepEqual(timeline, [
    { text: "hello", stream: "stdout" },
    { text: "\n", stream: "stdout" },
    { text: "> Run tests\n", stream: "stdout" },
    { text: "all green", stream: "stdout" },
  ]);
});

test("console presenter keeps active status transient instead of rewriting history", () => {
  const { status, surface } = createSurface();
  const presenter = createConsolePresenter({ surface });

  presenter.onDomainEvent(makeDomainEvent(
    "assistant.response_started",
    { responseId: "response-1" },
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
    "execution.completed",
    {
      executionId: "exec-1",
      status: "success",
      summary: "Run tests passed",
    },
    { requestId: "request-1" },
  ));

  assert.deepEqual(status, [
    "set:Thinking...",
    "clear",
    "set:Running Run tests...",
    "clear",
  ]);
});

test("console presenter records execution metadata for later inspection", () => {
  const { surface } = createSurface();
  const presenter = createConsolePresenter({ surface });

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
    "execution.completed",
    {
      executionId: "exec-1",
      status: "error",
      summary: "Run tests failed",
      errorCode: "EXIT_1",
      exitCode: 1,
    },
    { requestId: "request-1" },
  ));

  assert.deepEqual(presenter.getRecordedExecution("exec-1"), {
    requestId: "request-1",
    executionId: "exec-1",
    title: "Run tests",
    summary: "Run tests failed",
    status: "error",
    errorCode: "EXIT_1",
    exitCode: 1,
  });
});
