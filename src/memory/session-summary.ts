import type { ArtifactDocument, ArtifactRef } from "../contracts/artifact-schema.ts";
import type { SessionMode } from "../runtime/bootstrap-context.ts";

type TextDocumentLike = {
  path: string;
  content: string;
};

export type SessionSummaryInput = {
  mode: SessionMode;
  instructions: TextDocumentLike[];
  memory: TextDocumentLike[];
  requiredArtifacts: ArtifactDocument[];
  optionalArtifactRefs: ArtifactRef[];
  optionalArtifacts: ArtifactDocument[];
};

function formatList(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none";
}

export function renderSessionSummary(input: SessionSummaryInput): string {
  return [
    `mode: ${input.mode}`,
    `instructions: ${formatList(input.instructions.map((document) => document.path))}`,
    `memory: ${formatList(input.memory.map((document) => document.path))}`,
    `required docs: ${formatList(input.requiredArtifacts.map((artifact) => artifact.title))}`,
    `optional refs: ${formatList(input.optionalArtifactRefs.map((artifact) => artifact.title))}`,
    `optional docs: ${formatList(input.optionalArtifacts.map((artifact) => artifact.title))}`,
  ].join("\n");
}
