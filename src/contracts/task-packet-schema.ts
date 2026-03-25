import { z } from "zod";

import { artifactRefSchema } from "./artifact-schema.ts";

export const roleSchema = z.enum([
  "explorer",
  "reviewer",
  "implementer",
  "docs-researcher",
  "observer",
]);

export const taskPacketContextSchema = z.object({
  files: z.array(z.string().min(1)).optional(),
  artifacts: z.array(artifactRefSchema).optional(),
  constraints: z.array(z.string().min(1)).optional(),
});

export const taskPacketOutputFormatSchema = z.enum([
  "markdown",
  "json",
  "diff",
]);

export const taskPacketSchema = z.object({
  role: roleSchema,
  objective: z.string().min(1),
  context: taskPacketContextSchema,
  outputFormat: taskPacketOutputFormatSchema,
  maxTurns: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
});

export type Role = z.infer<typeof roleSchema>;
export type TaskPacketContext = z.infer<typeof taskPacketContextSchema>;
export type TaskPacketOutputFormat = z.infer<typeof taskPacketOutputFormatSchema>;
export type TaskPacket = z.infer<typeof taskPacketSchema>;
