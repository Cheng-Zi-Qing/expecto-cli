import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

import { createProtocolConsumer } from "../../src/protocol/protocol-consumer.ts";
import { serializeToNdjsonLine } from "../../src/protocol/ndjson-codec.ts";
import type { DomainEvent } from "../../src/protocol/domain-event-schema.ts";

test("protocol consumer deserializes NDJSON lines into DomainEvents", async () => {
  const stream = new PassThrough({ encoding: "utf8" });
  const received: DomainEvent[] = [];

  const consumer = createProtocolConsumer({
    input: stream,
    onEvent: (event) => received.push(event),
  });

  const event = {
    protocolVersion: "0.1.0",
    eventId: "evt-1",
    sessionId: "s-1",
    eventType: "session.started",
    sequence: 1,
    timestamp: "2026-04-13T00:00:00.000Z",
    payload: { mode: "balanced" },
  };

  stream.write(serializeToNdjsonLine(event as unknown as Record<string, unknown>));
  stream.end();

  await consumer.done;

  assert.equal(received.length, 1);
  assert.equal(received[0]!.eventType, "session.started");
  assert.equal(received[0]!.eventId, "evt-1");
});

test("protocol consumer preserves unknown fields for forward compatibility", async () => {
  const stream = new PassThrough({ encoding: "utf8" });
  const received: DomainEvent[] = [];

  const consumer = createProtocolConsumer({
    input: stream,
    onEvent: (event) => received.push(event),
  });

  stream.write('{"protocol_version":"0.1.0","event_id":"evt-1","session_id":"s-1","event_type":"session.started","sequence":1,"timestamp":"2026-04-13T00:00:00.000Z","payload":{},"new_field":"future"}\n');
  stream.end();

  await consumer.done;

  assert.equal(received.length, 1);
  assert.equal((received[0] as Record<string, unknown>).newField, "future");
});

test("protocol consumer calls onError for invalid lines", async () => {
  const stream = new PassThrough({ encoding: "utf8" });
  const errors: unknown[] = [];

  const consumer = createProtocolConsumer({
    input: stream,
    onEvent: () => {},
    onError: (error) => errors.push(error),
  });

  stream.write('not valid json\n');
  stream.end();

  await consumer.done;

  assert.equal(errors.length, 1);
});
