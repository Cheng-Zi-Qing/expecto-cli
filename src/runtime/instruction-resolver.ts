import type { ArtifactDocument, ArtifactRef } from "../contracts/artifact-schema.ts";
import { RUNTIME_IDENTITY_CONTENT, RUNTIME_IDENTITY_TITLE } from "../core/brand.ts";
import type { SessionMode } from "./bootstrap-context.ts";
import type { LoadedTextDocument } from "./instruction-loader.ts";

export type ResolvedInstructionLayerKind =
  | "identity"
  | "mode"
  | "project_instruction"
  | "artifact_summary";

export type ResolvedInstructionLayer = {
  id: string;
  kind: ResolvedInstructionLayerKind;
  title: string;
  content: string;
  path?: string;
};

export type ResolveInstructionSetInput = {
  mode: SessionMode;
  instructions: LoadedTextDocument[];
  requiredArtifacts: ArtifactDocument[];
  optionalArtifacts: ArtifactRef[];
};

export type ResolvedInstructionSet = {
  promptLayers: ResolvedInstructionLayer[];
  optionalArtifactRefs: ArtifactRef[];
};

function summarizeArtifact(document: ArtifactDocument): string {
  const lines = document.content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const heading = lines.find((line) => line.startsWith("#"));
  const bodyLines = lines.filter((line) => !line.startsWith("#")).slice(0, 5);

  const parts: string[] = [];
  if (heading) {
    parts.push(heading);
  }
  parts.push(`type: ${document.kind}`);
  if (document.status) {
    parts.push(`status: ${document.status}`);
  }
  if (bodyLines.length > 0) {
    parts.push(bodyLines.join("\n"));
  }

  return parts.join("\n");
}

export function resolveInstructionSet(
  input: ResolveInstructionSetInput,
): ResolvedInstructionSet {
  const promptLayers: ResolvedInstructionLayer[] = [
    {
      id: "runtime:identity",
      kind: "identity",
      title: RUNTIME_IDENTITY_TITLE,
      content: RUNTIME_IDENTITY_CONTENT,
    },
    {
      id: `runtime:mode:${input.mode}`,
      kind: "mode",
      title: `mode-${input.mode}`,
      content: `Current execution mode: ${input.mode}.`,
    },
    ...input.instructions.map((document) => ({
      id: `project:${document.path}`,
      kind: "project_instruction" as const,
      title: document.path,
      path: document.path,
      content: document.content,
    })),
    ...input.requiredArtifacts.map((artifact) => ({
      id: `artifact:${artifact.id}`,
      kind: "artifact_summary" as const,
      title: artifact.title,
      path: artifact.path,
      content: summarizeArtifact(artifact),
    })),
  ];

  return {
    promptLayers,
    optionalArtifactRefs: input.optionalArtifacts,
  };
}
