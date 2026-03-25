import { z } from "zod";

import { artifactRefSchema } from "./artifact-schema.ts";
import { toolResultSchema } from "./tool-result-schema.ts";

export const sessionStateSchema = z.enum([
  "idle",
  "clarifying",
  "planning",
  "executing",
  "reviewing",
  "verifying",
  "compacting",
  "blocked",
]);

export const checkpointSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
});

export const sessionSnapshotSummarySchema = z.object({
  headline: z.string().min(1),
  currentTaskId: z.string().min(1).optional(),
  nextStep: z.string().min(1).optional(),
});

export const sessionSnapshotSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  state: sessionStateSchema,
  activeArtifacts: z.array(artifactRefSchema),
  activatedSkills: z.array(z.string().min(1)),
  toolHistory: z.array(toolResultSchema),
  compactedSummary: z.string().min(1).optional(),
  summary: sessionSnapshotSummarySchema.optional(),
  checkpoint: checkpointSchema.optional(),
  updatedAt: z.string().datetime(),
});

export type SessionState = z.infer<typeof sessionStateSchema>;
export type Checkpoint = z.infer<typeof checkpointSchema>;
export type SessionSnapshotSummary = z.infer<typeof sessionSnapshotSummarySchema>;
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;
