import test from "node:test";
import assert from "node:assert/strict";

import { createProtocolEmitter } from "../../src/protocol/protocol-emitter.ts";
import type { DomainEvent, DomainFact } from "../../src/protocol/domain-event-schema.ts";
import { PROTOCOL_VERSION } from "../../src/protocol/protocol-version.ts";

test("protocol emitter assigns protocolVersion, eventId, and monotonic sequence", () => {
  const emitted: DomainEvent[] = [];
  const emitter = createProtocolEmitter({ onEvent: (event) => emitted.push(event) });

  const fact1: DomainFact = {
    eventType: "session.started",
    sessionId: "s-1",
    timestamp: "2026-04-13T00:00:00.000Z",
    payload: { mode: "balanced", entryKind: "interactive" },
  };
  const fact2: DomainFact = {
    eventType: "assistant.response_started",
    sessionId: "s-1",
    timestamp: "2026-04-13T00:00:01.000Z",
    causation: { requestId: "r-1" },
    payload: { responseId: "resp-1" },
  };

  emitter.emit(fact1);
  emitter.emit(fact2);

  assert.equal(emitted.length, 2);
  assert.equal(emitted[0]!.protocolVersion, PROTOCOL_VERSION);
  assert.ok(emitted[0]!.eventId.length > 0);
  assert.equal(emitted[0]!.sequence, 1);
  assert.equal(emitted[0]!.eventType, "session.started");
  assert.equal(emitted[0]!.causation, undefined);
  assert.equal(emitted[1]!.sequence, 2);
  assert.equal(emitted[1]!.causation?.requestId, "r-1");
});

test("protocol emitter maintains independent sequence counters per sessionId", () => {
  const emitted: DomainEvent[] = [];
  const emitter = createProtocolEmitter({ onEvent: (event) => emitted.push(event) });

  emitter.emit({ eventType: "session.started", sessionId: "s-1", timestamp: "2026-04-13T00:00:00.000Z", payload: {} });
  emitter.emit({ eventType: "session.started", sessionId: "s-2", timestamp: "2026-04-13T00:00:00.000Z", payload: {} });
  emitter.emit({ eventType: "session.stopped", sessionId: "s-1", timestamp: "2026-04-13T00:00:01.000Z", payload: { state: "idle" } });

  assert.equal(emitted[0]!.sessionId, "s-1");
  assert.equal(emitted[0]!.sequence, 1);
  assert.equal(emitted[1]!.sessionId, "s-2");
  assert.equal(emitted[1]!.sequence, 1);
  assert.equal(emitted[2]!.sessionId, "s-1");
  assert.equal(emitted[2]!.sequence, 2);
});

test("protocol emitter generates unique eventIds", () => {
  const emitted: DomainEvent[] = [];
  const emitter = createProtocolEmitter({ onEvent: (event) => emitted.push(event) });

  for (let i = 0; i < 10; i++) {
    emitter.emit({ eventType: "session.state_changed", sessionId: "s-1", timestamp: "2026-04-13T00:00:00.000Z", payload: { state: "ready" } });
  }

  const ids = new Set(emitted.map((e) => e.eventId));
  assert.equal(ids.size, 10);
});
