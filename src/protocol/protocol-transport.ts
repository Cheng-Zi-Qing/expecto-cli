import { PassThrough, type Readable } from "node:stream";
import { createInterface } from "node:readline";

import { domainEventSchema, type DomainEvent } from "./domain-event-schema.ts";
import { serializeToNdjsonLine, deserializeNdjsonLine } from "./ndjson-codec.ts";

export type ProtocolTransport = {
  eventWriter: PassThrough;
  eventReader: Readable;
  requestWriter: PassThrough;
  requestReader: Readable;
};

export function createProtocolTransport(): ProtocolTransport {
  const eventChannel = new PassThrough({ objectMode: false, encoding: "utf8" });
  const requestChannel = new PassThrough({ objectMode: false, encoding: "utf8" });

  return {
    eventWriter: eventChannel,
    eventReader: eventChannel,
    requestWriter: requestChannel,
    requestReader: requestChannel,
  };
}

export function writeEventToTransport(
  transport: ProtocolTransport,
  event: DomainEvent,
): void {
  transport.eventWriter.write(serializeToNdjsonLine(event as unknown as Record<string, unknown>));
}

export async function* readEventsFromTransport(
  transport: ProtocolTransport,
): AsyncGenerator<DomainEvent> {
  const rl = createInterface({ input: transport.eventReader, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim().length === 0) {
      continue;
    }
    const raw = deserializeNdjsonLine(line);
    yield domainEventSchema.parse(raw);
  }
}
