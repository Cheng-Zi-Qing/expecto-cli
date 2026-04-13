import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

import { createRequestDispatcher } from "../../src/protocol/request-dispatcher.ts";
import { serializeToNdjsonLine } from "../../src/protocol/ndjson-codec.ts";
import type { RequestEnvelope } from "../../src/protocol/request-envelope-schema.ts";
import type { ProtocolError } from "../../src/protocol/domain-event-schema.ts";

test("request dispatcher deserializes and routes valid requests", async () => {
  const stream = new PassThrough({ encoding: "utf8" });
  const received: RequestEnvelope[] = [];

  const dispatcher = createRequestDispatcher({
    input: stream,
    onRequest: (envelope) => received.push(envelope),
  });

  const envelope = {
    protocolVersion: "0.1.0",
    requestId: "r-1",
    sessionId: "s-1",
    type: "prompt.submit",
    payload: { prompt: "fix auth" },
  };

  stream.write(serializeToNdjsonLine(envelope as unknown as Record<string, unknown>));
  stream.end();

  await dispatcher.done;

  assert.equal(received.length, 1);
  assert.equal(received[0]!.type, "prompt.submit");
  assert.equal(received[0]!.requestId, "r-1");
});

test("request dispatcher emits ProtocolError for malformed input", async () => {
  const stream = new PassThrough({ encoding: "utf8" });
  const errors: ProtocolError[] = [];

  const dispatcher = createRequestDispatcher({
    input: stream,
    onRequest: () => {},
    onProtocolError: (error) => errors.push(error),
  });

  stream.write('{"not_a_valid":"envelope"}\n');
  stream.end();

  await dispatcher.done;

  assert.equal(errors.length, 1);
  assert.equal(errors[0]!.error.code, "MALFORMED_REQUEST");
});

test("request dispatcher handles multiple valid requests", async () => {
  const stream = new PassThrough({ encoding: "utf8" });
  const received: RequestEnvelope[] = [];

  const dispatcher = createRequestDispatcher({
    input: stream,
    onRequest: (envelope) => received.push(envelope),
  });

  for (const type of ["prompt.submit", "command.execute", "session.interrupt"]) {
    stream.write(serializeToNdjsonLine({
      protocolVersion: "0.1.0",
      requestId: `r-${type}`,
      sessionId: "s-1",
      type,
      payload: {},
    }));
  }
  stream.end();

  await dispatcher.done;

  assert.equal(received.length, 3);
  assert.deepEqual(received.map((r) => r.type), ["prompt.submit", "command.execute", "session.interrupt"]);
});
