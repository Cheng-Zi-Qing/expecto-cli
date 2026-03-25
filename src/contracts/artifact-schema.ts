import { z } from "zod";

export const artifactKindSchema = z.enum([
  "requirements",
  "plan",
  "task",
  "summary",
  "finding",
  "memory_note",
  "lesson",
]);

export const artifactRefSchema = z.object({
  id: z.string().min(1),
  kind: artifactKindSchema,
  path: z.string().min(1),
  title: z.string().min(1),
  status: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const artifactDocumentSchema = artifactRefSchema.extend({
  content: z.string(),
});

export const artifactWriteInputSchema = z.object({
  kind: artifactKindSchema,
  path: z.string().min(1),
  title: z.string().min(1),
  content: z.string(),
  status: z.string().min(1).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const activeArtifactSetSchema = z.object({
  required: z.array(artifactRefSchema),
  optional: z.array(artifactRefSchema),
  onDemand: z.array(artifactRefSchema),
});

export type ArtifactKind = z.infer<typeof artifactKindSchema>;
export type ArtifactRef = z.infer<typeof artifactRefSchema>;
export type ArtifactDocument = z.infer<typeof artifactDocumentSchema>;
export type ArtifactWriteInput = z.infer<typeof artifactWriteInputSchema>;
export type ActiveArtifactSet = z.infer<typeof activeArtifactSetSchema>;
