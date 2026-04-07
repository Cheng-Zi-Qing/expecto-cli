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

function formatArtifactRef(ref: ArtifactRef): string {
  return ref.status ? `${ref.title} [${ref.status}] (${ref.path})` : `${ref.title} (${ref.path})`;
}

function formatList(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none";
}

export function renderSessionSummary(input: SessionSummaryInput): string {
  const requiredLines = input.requiredArtifacts.length > 0
    ? input.requiredArtifacts.map((a) => `  [required] ${formatArtifactRef(a)}`).join("\n")
    : "  none";

  const optionalLines = input.optionalArtifactRefs.length > 0
    ? input.optionalArtifactRefs.map((a) => `  [optional] ${formatArtifactRef(a)}`).join("\n")
    : "  none";

  return [
    `mode: ${input.mode}`,
    `instructions: ${formatList(input.instructions.map((d) => d.path))}`,
    `memory: ${formatList(input.memory.map((d) => d.path))}`,
    `artifacts:`,
    requiredLines,
    optionalLines,
  ].join("\n");
}
