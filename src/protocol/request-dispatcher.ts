import { createInterface } from "node:readline";
import type { Readable } from "node:stream";

import type { ProtocolError } from "./domain-event-schema.ts";
import { requestEnvelopeSchema, type RequestEnvelope } from "./request-envelope-schema.ts";
import { deserializeNdjsonLine } from "./ndjson-codec.ts";
import { PROTOCOL_VERSION } from "./protocol-version.ts";

export type RequestDispatcherOptions = {
  readonly input: Readable;
  readonly onRequest: (envelope: RequestEnvelope) => void;
  readonly onProtocolError?: (error: ProtocolError) => void;
};

export type RequestDispatcher = {
  readonly done: Promise<void>;
};

export function createRequestDispatcher(
  options: RequestDispatcherOptions,
): RequestDispatcher {
  const rl = createInterface({ input: options.input, crlfDelay: Infinity });

  const done = (async () => {
    for await (const line of rl) {
      if (line.trim().length === 0) {
        continue;
      }
      try {
        const raw = deserializeNdjsonLine(line);
        const envelope = requestEnvelopeSchema.parse(raw);
        options.onRequest(envelope);
      } catch {
        options.onProtocolError?.({
          protocolVersion: PROTOCOL_VERSION,
          error: {
            code: "MALFORMED_REQUEST",
            message: "Failed to parse request envelope",
          },
        });
      }
    }
  })();

  return { done };
}
