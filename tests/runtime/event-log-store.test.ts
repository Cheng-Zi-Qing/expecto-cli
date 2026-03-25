import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createSessionId } from "../../src/runtime/session-id.ts";
import { EventLogStore } from "../../src/runtime/event-log-store.ts";

async function makeProjectRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "beta-agent-events-"));
}

test("createSessionId returns a session-prefixed identifier", () => {
  const sessionId = createSessionId();

  assert.match(sessionId, /^session-[0-9a-f-]+$/);
});

test("event log store appends and lists runtime events for a session", async () => {
  const projectRoot = await makeProjectRoot();
  const store = new EventLogStore(projectRoot);

  await store.append({
    type: "session:start",
    sessionId: "session-1",
    timestamp: "2026-03-23T10:00:00.000Z",
    payload: {
      mode: "balanced",
    },
  });
  await store.append({
    type: "turn:start",
    sessionId: "session-1",
    timestamp: "2026-03-23T10:00:01.000Z",
    payload: {
      turnId: "turn-1",
    },
  });

  const events = await store.list("session-1");
  const persisted = await readFile(
    join(projectRoot, ".beta-agent", "state", "events", "session-1.jsonl"),
    "utf8",
  );

  assert.equal(events.length, 2);
  assert.equal(events[0]?.type, "session:start");
  assert.equal(events[1]?.type, "turn:start");
  assert.match(persisted, /session:start/);
  assert.match(persisted, /turn:start/);
});
