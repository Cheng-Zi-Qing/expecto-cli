import { z } from "zod";

export const runtimeEventTypeSchema = z.enum([
  "session:start",
  "session:resume",
  "session:stop",
  "turn:start",
  "turn:end",
  "tool:pre",
  "tool:post",
  "compact:pre",
  "compact:post",
  "subagent:start",
  "subagent:end",
]);

export const runtimeEventSchema = z.object({
  type: runtimeEventTypeSchema,
  sessionId: z.string().min(1),
  timestamp: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
});

export type RuntimeEventType = z.infer<typeof runtimeEventTypeSchema>;
export type RuntimeEvent = z.infer<typeof runtimeEventSchema>;
