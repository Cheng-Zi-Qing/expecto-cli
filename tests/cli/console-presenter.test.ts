import assert from "node:assert/strict";
import test from "node:test";

import { createConsolePresenter } from "../../src/cli/console-presenter.ts";

const baseEvent = {
  timestamp: "2024-01-01T00:00:00.000Z",
  sessionId: "session-1",
  turnId: "turn-1",
  requestId: "request-1",
} as const;

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
      delta: "hello",
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

  presenter.onInteractionEvent({
    ...baseEvent,
    eventType: "assistant_response_started",
    payload: {
      responseId: "response-1",
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
    eventType: "execution_item_completed",
    payload: {
      executionId: "exec-1",
      status: "success",
      summary: "Run tests passed",
    },
  });

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
    eventType: "execution_item_completed",
    payload: {
      executionId: "exec-1",
      status: "error",
      summary: "Run tests failed",
      errorCode: "EXIT_1",
      exitCode: 1,
    },
  });

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
