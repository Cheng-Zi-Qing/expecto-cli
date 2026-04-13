import test from "node:test";
import assert from "node:assert/strict";

import {
  domainEventSchema,
  domainFactSchema,
  protocolErrorSchema,
} from "../../src/protocol/domain-event-schema.ts";

test("domainEventSchema accepts a valid session lifecycle event", () => {
  const event = {
    protocolVersion: "0.1.0",
    eventId: "evt-1",
    sessionId: "s-1",
    eventType: "session.started",
    sequence: 1,
    timestamp: "2026-04-13T00:00:00.000Z",
    payload: { mode: "balanced", entryKind: "interactive" },
  };
  const parsed = domainEventSchema.parse(event);
  assert.equal(parsed.eventType, "session.started");
  assert.equal(parsed.sequence, 1);
  assert.equal(parsed.causation, undefined);
});

test("domainEventSchema accepts a request-scoped event with causation", () => {
  const event = {
    protocolVersion: "0.1.0",
    eventId: "evt-2",
    sessionId: "s-1",
    eventType: "assistant.stream_chunk",
    sequence: 5,
    timestamp: "2026-04-13T00:00:01.000Z",
    causation: { requestId: "r-1" },
    payload: { responseId: "resp-1", channel: "output_text", format: "markdown", delta: "hello" },
  };
  const parsed = domainEventSchema.parse(event);
  assert.equal(parsed.causation?.requestId, "r-1");
});

test("domainEventSchema rejects missing required fields", () => {
  assert.throws(() => domainEventSchema.parse({ eventType: "session.started" }));
});

test("domainEventSchema ignores unknown fields for forward compatibility", () => {
  const event = {
    protocolVersion: "0.1.0",
    eventId: "evt-3",
    sessionId: "s-1",
    eventType: "session.started",
    sequence: 1,
    timestamp: "2026-04-13T00:00:00.000Z",
    payload: {},
    futureField: "unknown",
  };
  const parsed = domainEventSchema.parse(event);
  assert.equal(parsed.eventType, "session.started");
});

test("domainFactSchema accepts a fact without envelope fields", () => {
  const fact = {
    eventType: "session.started",
    sessionId: "s-1",
    timestamp: "2026-04-13T00:00:00.000Z",
    payload: { mode: "balanced", entryKind: "interactive" },
  };
  const parsed = domainFactSchema.parse(fact);
  assert.equal(parsed.eventType, "session.started");
  assert.equal(parsed.causation, undefined);
});

test("protocolErrorSchema accepts a transport-level error", () => {
  const error = {
    protocolVersion: "0.1.0",
    error: { code: "MALFORMED_REQUEST", message: "Missing session_id" },
  };
  const parsed = protocolErrorSchema.parse(error);
  assert.equal(parsed.error.code, "MALFORMED_REQUEST");
});
