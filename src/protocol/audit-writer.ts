import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

import type { DomainEvent } from "./domain-event-schema.ts";
import { serializeToNdjsonLine } from "./ndjson-codec.ts";

export type AuditWriter = {
  write: (event: DomainEvent) => Promise<void>;
  close: () => Promise<void>;
};

export function createAuditWriter(directory: string): AuditWriter {
  const filePath = join(directory, "audit.jsonl");
  let dirReady = false;
  let closed = false;
  let tail = Promise.resolve();

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    if (closed) {
      return Promise.reject(new Error("audit writer is closed"));
    }

    const result = tail.then(task, task);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };

  return {
    write(event: DomainEvent): Promise<void> {
      return enqueue(async () => {
        if (!dirReady) {
          await mkdir(directory, { recursive: true });
          dirReady = true;
        }
        const line = serializeToNdjsonLine(
          event as unknown as Record<string, unknown>,
        );
        await appendFile(filePath, line, "utf8");
      });
    },
    async close(): Promise<void> {
      closed = true;
      await tail;
    },
  };
}
