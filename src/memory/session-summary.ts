import type { ArtifactRef } from "../contracts/artifact-schema.ts";
import type { SessionMode } from "../runtime/bootstrap-context.ts";

type TextDocumentLike = {
  path: string;
  content: string;
};

export type SessionSummaryArtifacts = {
  required: ArtifactRef[];
  optional: ArtifactRef[];
  onDemand: ArtifactRef[];
};

export type SessionSummaryInput = {
  mode: SessionMode;
  instructions: TextDocumentLike[];
  memory: TextDocumentLike[];
  artifacts: SessionSummaryArtifacts;
};

const LAYER_LABELS: Array<{ key: keyof SessionSummaryArtifacts; label: string }> = [
  { key: "required", label: "[required]" },
  { key: "optional", label: "[optional]" },
  { key: "onDemand", label: "[onDemand]" },
];

function formatList(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none";
}

function formatRefLine(label: string, ref: ArtifactRef): string {
  const base = `  ${label}  ${ref.title} (${ref.path})`;
  return ref.status ? `${base} [${ref.status}]` : base;
}

function formatArtifactLayer(label: string, refs: ArtifactRef[]): string[] {
  if (refs.length === 0) {
    return [`  ${label}  none`];
  }

  return refs.map((ref) => formatRefLine(label, ref));
}

export function renderSessionSummary(input: SessionSummaryInput): string {
  const artifactLines = LAYER_LABELS.flatMap(({ key, label }) =>
    formatArtifactLayer(label, input.artifacts[key]),
  );

  return [
    `mode: ${input.mode}`,
    `instructions: ${formatList(input.instructions.map((d) => d.path))}`,
    `memory: ${formatList(input.memory.map((d) => d.path))}`,
    "artifacts:",
    ...artifactLines,
  ].join("\n");
}
