import type { SessionSnapshot } from "../contracts/session-snapshot-schema.ts";
import { SessionSnapshotStore } from "./session-snapshot-store.ts";

export type ResolveResumeTargetInput = {
  sessionId?: string;
};

export type ResumeTarget = {
  snapshot: SessionSnapshot;
  summary: string;
};

// buildResumeSummary emits ONLY resume-specific metadata (session identity,
// checkpoint, headline, next step, compacted summary). The active artifact set
// is intentionally NOT listed here — renderSessionSummary is the single source
// of truth for that, and the bootstrap pipeline appends its output alongside
// this metadata when building the state layer on resume.
export function buildResumeSummary(snapshot: SessionSnapshot): string {
  return [
    `session: ${snapshot.sessionId}`,
    `snapshot: ${snapshot.id}`,
    `state: ${snapshot.state}`,
    `updated: ${snapshot.updatedAt}`,
    `checkpoint: ${snapshot.checkpoint?.id ?? "none"}`,
    ...(snapshot.summary?.headline ? [`headline: ${snapshot.summary.headline}`] : []),
    ...(snapshot.summary?.currentTaskId ? [`current task: ${snapshot.summary.currentTaskId}`] : []),
    ...(snapshot.summary?.nextStep ? [`next step: ${snapshot.summary.nextStep}`] : []),
    `compacted summary: ${snapshot.compactedSummary ?? "none"}`,
  ].join("\n");
}

export async function resolveResumeTarget(
  store: SessionSnapshotStore,
  input: ResolveResumeTargetInput = {},
): Promise<ResumeTarget | null> {
  const snapshot = await store.findLatest(input.sessionId);

  if (!snapshot) {
    return null;
  }

  return {
    snapshot,
    summary: buildResumeSummary(snapshot),
  };
}
