import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

import type { DomainEvent } from "./domain-event-schema.ts";
import { serializeToNdjsonLine } from "./ndjson-codec.ts";

export type AuditWriter = {
  write: (event: DomainEvent) => Promise<void>;
};

export function createAuditWriter(directory: string): AuditWriter {
  const filePath = join(directory, "audit.jsonl");
  let dirReady = false;

  return {
    async write(event: DomainEvent): Promise<void> {
      if (!dirReady) {
        await mkdir(directory, { recursive: true });
        dirReady = true;
      }
      const line = serializeToNdjsonLine(
        event as unknown as Record<string, unknown>,
      );
      await appendFile(filePath, line, "utf8");
    },
  };
}
