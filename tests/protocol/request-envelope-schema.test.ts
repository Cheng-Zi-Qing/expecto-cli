import test from "node:test";
import assert from "node:assert/strict";

import { requestEnvelopeSchema } from "../../src/protocol/request-envelope-schema.ts";

test("requestEnvelopeSchema accepts a valid prompt.submit request", () => {
  const envelope = {
    protocolVersion: "0.1.0",
    requestId: "r-1",
    sessionId: "s-1",
    type: "prompt.submit",
    payload: { prompt: "fix auth" },
  };
  const parsed = requestEnvelopeSchema.parse(envelope);
  assert.equal(parsed.type, "prompt.submit");
  assert.equal(parsed.requestId, "r-1");
});

test("requestEnvelopeSchema accepts session.resume with empty payload", () => {
  const envelope = {
    protocolVersion: "0.1.0",
    requestId: "r-2",
    sessionId: "s-1",
    type: "session.resume",
    payload: {},
  };
  const parsed = requestEnvelopeSchema.parse(envelope);
  assert.deepEqual(parsed.payload, {});
});

test("requestEnvelopeSchema rejects missing requestId", () => {
  assert.throws(() =>
    requestEnvelopeSchema.parse({
      protocolVersion: "0.1.0",
      sessionId: "s-1",
      type: "prompt.submit",
      payload: {},
    }),
  );
});
