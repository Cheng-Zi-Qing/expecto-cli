import { randomUUID } from "node:crypto";

export function createSessionId(): string {
  return `session-${randomUUID()}`;
}
