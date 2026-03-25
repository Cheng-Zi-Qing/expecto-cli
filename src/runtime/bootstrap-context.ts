import { resolve } from "node:path";

import type { CliCommand } from "../cli/arg-parser.ts";
import type { ArtifactDocument, ActiveArtifactSet } from "../contracts/artifact-schema.ts";
import { ActiveArtifactResolver } from "../core/active-artifact-resolver.ts";
import { ArtifactStore } from "../core/artifact-store.ts";
import { loadProjectMemoryDocuments } from "../memory/project-memory-loader.ts";
import { renderSessionSummary } from "../memory/session-summary.ts";
import { loadInstructionDocuments, type LoadedTextDocument } from "./instruction-loader.ts";
import {
  resolveInstructionSet,
  type ResolvedInstructionLayer,
} from "./instruction-resolver.ts";

export type SessionMode = "fast" | "balanced" | "strict";

export type LoadedArtifactSet = {
  required: ArtifactDocument[];
  optional: ArtifactDocument[];
};

export type BootstrapContext = {
  projectRoot: string;
  mode: SessionMode;
  entry: CliCommand;
  instructions: LoadedTextDocument[];
  instructionStack?: ResolvedInstructionLayer[];
  memory: LoadedTextDocument[];
  activeArtifacts: ActiveArtifactSet;
  loadedArtifacts: LoadedArtifactSet;
  sessionSummary?: string;
};

export type BuildBootstrapContextInput = {
  command: CliCommand;
  cwd?: string;
  activeTaskId?: string;
};

export async function buildBootstrapContext(
  input: BuildBootstrapContextInput,
): Promise<BootstrapContext> {
  const projectRoot = resolve(input.cwd ?? process.cwd());
  const [instructions, memory] = await Promise.all([
    loadInstructionDocuments(projectRoot),
    loadProjectMemoryDocuments(projectRoot),
  ]);
  const store = new ArtifactStore(projectRoot);
  const resolver = new ActiveArtifactResolver(store);
  const activeArtifacts = await resolver.resolve(
    input.activeTaskId ? { activeTaskId: input.activeTaskId } : {},
  );
  const requiredArtifacts = await Promise.all(
    activeArtifacts.required.map((artifact) => store.read(artifact.id)),
  );
  const instructionStack = resolveInstructionSet({
    mode: "balanced",
    instructions,
    requiredArtifacts,
    optionalArtifacts: activeArtifacts.optional,
  });

  return {
    projectRoot,
    mode: "balanced",
    entry: input.command,
    instructions,
    instructionStack: instructionStack.promptLayers,
    memory,
    activeArtifacts,
    loadedArtifacts: {
      required: requiredArtifacts,
      optional: [],
    },
    sessionSummary: renderSessionSummary({
      mode: "balanced",
      instructions,
      memory,
      requiredArtifacts,
      optionalArtifactRefs: activeArtifacts.optional,
      optionalArtifacts: [],
    }),
  };
}
