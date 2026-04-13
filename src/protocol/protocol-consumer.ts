import { createInterface } from "node:readline";
import type { Readable } from "node:stream";

import { domainEventSchema, type DomainEvent } from "./domain-event-schema.ts";
import { deserializeNdjsonLine } from "./ndjson-codec.ts";

export type ProtocolConsumerOptions = {
  readonly input: Readable;
  readonly onEvent: (event: DomainEvent) => void;
  readonly onError?: (error: unknown) => void;
};

export type ProtocolConsumer = {
  readonly done: Promise<void>;
};

export function createProtocolConsumer(
  options: ProtocolConsumerOptions,
): ProtocolConsumer {
  const rl = createInterface({ input: options.input, crlfDelay: Infinity });

  const done = (async () => {
    for await (const line of rl) {
      if (line.trim().length === 0) {
        continue;
      }
      try {
        const raw = deserializeNdjsonLine(line);
        const event = domainEventSchema.parse(raw);
        options.onEvent(event);
      } catch (error) {
        options.onError?.(error);
      }
    }
  })();

  return { done };
}
