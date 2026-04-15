import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createAuditWriter } from "../../src/protocol/audit-writer.ts";
import type { DomainEvent } from "../../src/protocol/domain-event-schema.ts";

test("audit writer appends NDJSON lines to audit.jsonl", async () => {
  const dir = await mkdtemp(join(tmpdir(), "expecto-audit-"));
  const writer = createAuditWriter(dir);

  const event: DomainEvent = {
    protocolVersion: "0.1.0",
    eventId: "evt-1",
    sessionId: "s-1",
    eventType: "session.started",
    sequence: 1,
    timestamp: "2026-04-13T00:00:00.000Z",
    payload: { mode: "balanced" },
  };

  await writer.write(event);
  await writer.write({
    ...event,
    eventId: "evt-2",
    eventType: "session.stopped",
    sequence: 2,
    payload: { state: "idle" },
  });

  const content = await readFile(join(dir, "audit.jsonl"), "utf8");
  const lines = content.trim().split("\n");

  assert.equal(lines.length, 2);

  const first = JSON.parse(lines[0]!);
  assert.equal(first.protocol_version, "0.1.0");
  assert.equal(first.event_type, "session.started");

  const second = JSON.parse(lines[1]!);
  assert.equal(second.event_type, "session.stopped");
});

test("audit writer flushes queued writes before close resolves", async () => {
  const dir = await mkdtemp(join(tmpdir(), "expecto-audit-"));
  const writer = createAuditWriter(dir);

  const baseEvent: DomainEvent = {
    protocolVersion: "0.1.0",
    eventId: "evt-queued-1",
    sessionId: "session-queued",
    eventType: "session.started",
    sequence: 1,
    timestamp: "2026-04-13T00:00:00.000Z",
    payload: { entryKind: "print" },
  };

  void writer.write(baseEvent);
  void writer.write({
    ...baseEvent,
    eventId: "evt-queued-2",
    eventType: "session.stopped",
    sequence: 2,
    payload: { state: "idle" },
  });

  await writer.close();

  const content = await readFile(join(dir, "audit.jsonl"), "utf8");
  const lines = content.trim().split("\n");

  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[0]!).event_type, "session.started");
  assert.equal(JSON.parse(lines[1]!).event_type, "session.stopped");
});
