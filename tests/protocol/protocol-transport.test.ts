import test from "node:test";
import assert from "node:assert/strict";

import {
  createProtocolTransport,
  writeEventToTransport,
  readEventsFromTransport,
} from "../../src/protocol/protocol-transport.ts";
import type { DomainEvent } from "../../src/protocol/domain-event-schema.ts";

test("transport round-trips a DomainEvent through NDJSON serialization boundary", async () => {
  const transport = createProtocolTransport();

  const event: DomainEvent = {
    protocolVersion: "0.1.0",
    eventId: "evt-1",
    sessionId: "s-1",
    eventType: "session.started",
    sequence: 1,
    timestamp: "2026-04-13T00:00:00.000Z",
    payload: { mode: "balanced", entryKind: "interactive" },
  };

  writeEventToTransport(transport, event);
  transport.eventWriter.end();

  const received: DomainEvent[] = [];
  for await (const parsed of readEventsFromTransport(transport)) {
    received.push(parsed);
  }

  assert.equal(received.length, 1);
  assert.equal(received[0]!.eventId, "evt-1");
  assert.equal(received[0]!.eventType, "session.started");
  assert.equal(received[0]!.payload.entryKind, "interactive");
  assert.equal(received[0]!.sequence, 1);
});

test("transport handles multiple events as separate NDJSON lines", async () => {
  const transport = createProtocolTransport();

  for (let i = 1; i <= 3; i++) {
    writeEventToTransport(transport, {
      protocolVersion: "0.1.0",
      eventId: `evt-${i}`,
      sessionId: "s-1",
      eventType: "session.state_changed",
      sequence: i,
      timestamp: "2026-04-13T00:00:00.000Z",
      payload: { state: "ready" },
    });
  }
  transport.eventWriter.end();

  const received: DomainEvent[] = [];
  for await (const parsed of readEventsFromTransport(transport)) {
    received.push(parsed);
  }

  assert.equal(received.length, 3);
  assert.deepEqual(received.map((e) => e.sequence), [1, 2, 3]);
});
