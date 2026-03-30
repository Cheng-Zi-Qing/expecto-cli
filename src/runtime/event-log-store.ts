import { mkdir, readFile, appendFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { runtimeEventSchema, type RuntimeEvent } from "../contracts/event-schema.ts";
import { currentAppPath } from "../core/brand.ts";

const eventDirectory = currentAppPath("state", "events");

function ensureValidSessionId(sessionId: string): string {
  if (sessionId.includes("/") || sessionId.includes("\\")) {
    throw new Error(`Session ids must not contain path separators: ${sessionId}`);
  }

  return sessionId;
}

export class EventLogStore {
  readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = resolve(projectRoot);
  }

  async append(event: RuntimeEvent): Promise<RuntimeEvent> {
    const parsed = runtimeEventSchema.parse(event);

    await mkdir(join(this.projectRoot, eventDirectory), { recursive: true });
    await appendFile(
      this.toEventLogPath(parsed.sessionId),
      `${JSON.stringify(parsed)}\n`,
      "utf8",
    );

    return parsed;
  }

  async list(sessionId: string): Promise<RuntimeEvent[]> {
    const content = await readFile(this.toEventLogPath(sessionId), "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => runtimeEventSchema.parse(JSON.parse(line)));
  }

  private toEventLogPath(sessionId: string, directory = eventDirectory): string {
    return join(this.projectRoot, directory, `${ensureValidSessionId(sessionId)}.jsonl`);
  }
}
