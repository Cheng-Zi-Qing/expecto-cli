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
import { resolveResumeTarget, type ResumeTarget } from "./resume.ts";
import { SessionSnapshotStore } from "./session-snapshot-store.ts";

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
  resumeTarget?: ResumeTarget;
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

  const resumeTarget =
    input.command.kind === "resume"
      ? await resolveResumeTarget(new SessionSnapshotStore(projectRoot), {})
      : undefined;

  const resolvedActiveArtifacts = resumeTarget
    ? resumeTarget.snapshot.activeArtifacts
    : activeArtifacts;

  const resolvedRequiredArtifacts = resumeTarget
    ? (
        await Promise.all(
          resumeTarget.snapshot.activeArtifacts.required.map((artifact) =>
            store.read(artifact.id).catch(() => null),
          ),
        )
      ).filter((doc): doc is ArtifactDocument => doc !== null)
    : requiredArtifacts;

  const resolvedInstructionStack = resumeTarget
    ? resolveInstructionSet({
        mode: "balanced",
        instructions,
        requiredArtifacts: resolvedRequiredArtifacts,
        optionalArtifacts: resolvedActiveArtifacts.optional,
      })
    : instructionStack;

  const resolvedOptionalArtifacts = resumeTarget
    ? (
        await Promise.all(
          resumeTarget.snapshot.activeArtifacts.optional.map((artifact) =>
            store.read(artifact.id).catch(() => null),
          ),
        )
      ).filter((doc): doc is ArtifactDocument => doc !== null)
    : [];

  return {
    projectRoot,
    mode: "balanced",
    entry: input.command,
    instructions,
    instructionStack: resolvedInstructionStack.promptLayers,
    memory,
    activeArtifacts: resolvedActiveArtifacts,
    loadedArtifacts: {
      required: resolvedRequiredArtifacts,
      optional: resolvedOptionalArtifacts,
    },
    sessionSummary: renderSessionSummary({
      mode: "balanced",
      instructions,
      memory,
      requiredArtifacts: resolvedRequiredArtifacts,
      optionalArtifactRefs: resolvedActiveArtifacts.optional,
      optionalArtifacts: resolvedOptionalArtifacts,
    }),
    ...(resumeTarget ? { resumeTarget } : {}),
  };
}
