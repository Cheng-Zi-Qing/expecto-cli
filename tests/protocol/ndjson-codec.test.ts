import test from "node:test";
import assert from "node:assert/strict";

import {
  serializeToNdjsonLine,
  deserializeNdjsonLine,
} from "../../src/protocol/ndjson-codec.ts";

test("serializeToNdjsonLine converts camelCase keys to snake_case and appends newline", () => {
  const obj = {
    protocolVersion: "0.1.0",
    eventId: "evt-1",
    sessionId: "s-1",
    eventType: "session.started",
    sequence: 1,
    timestamp: "2026-04-13T00:00:00.000Z",
    payload: { entryKind: "interactive" },
  };
  const line = serializeToNdjsonLine(obj);
  assert.ok(line.endsWith("\n"));
  const parsed = JSON.parse(line);
  assert.equal(parsed.protocol_version, "0.1.0");
  assert.equal(parsed.event_id, "evt-1");
  assert.equal(parsed.session_id, "s-1");
  assert.equal(parsed.event_type, "session.started");
  assert.equal(parsed.payload.entry_kind, "interactive");
});

test("serializeToNdjsonLine converts nested causation keys", () => {
  const obj = {
    protocolVersion: "0.1.0",
    eventId: "evt-2",
    sessionId: "s-1",
    eventType: "assistant.stream_chunk",
    sequence: 2,
    timestamp: "2026-04-13T00:00:00.000Z",
    causation: { requestId: "r-1" },
    payload: { responseId: "resp-1" },
  };
  const line = serializeToNdjsonLine(obj);
  const parsed = JSON.parse(line);
  assert.equal(parsed.causation.request_id, "r-1");
  assert.equal(parsed.payload.response_id, "resp-1");
});

test("deserializeNdjsonLine converts snake_case keys to camelCase", () => {
  const line = '{"protocol_version":"0.1.0","event_id":"evt-1","session_id":"s-1","event_type":"session.started","sequence":1,"timestamp":"2026-04-13T00:00:00.000Z","payload":{"entry_kind":"interactive"}}';
  const obj = deserializeNdjsonLine(line);
  assert.equal(obj.protocolVersion, "0.1.0");
  assert.equal(obj.eventId, "evt-1");
  assert.equal(obj.sessionId, "s-1");
  assert.equal((obj.payload as Record<string, unknown>).entryKind, "interactive");
});

test("round-trip preserves data integrity", () => {
  const original = {
    protocolVersion: "0.1.0",
    eventId: "evt-3",
    sessionId: "s-1",
    eventType: "execution.completed",
    sequence: 10,
    timestamp: "2026-04-13T00:00:00.000Z",
    causation: { requestId: "r-5" },
    payload: { executionId: "exec-1", exitCode: 0 },
  };
  const line = serializeToNdjsonLine(original);
  const restored = deserializeNdjsonLine(line);
  assert.deepEqual(restored, original);
});

test("deserializeNdjsonLine preserves unknown snake_case fields", () => {
  const line = '{"protocol_version":"0.1.0","event_id":"evt-1","session_id":"s-1","event_type":"session.started","sequence":1,"timestamp":"2026-04-13T00:00:00.000Z","payload":{},"future_field":"unknown"}';
  const obj = deserializeNdjsonLine(line);
  assert.equal(obj.futureField, "unknown");
});
