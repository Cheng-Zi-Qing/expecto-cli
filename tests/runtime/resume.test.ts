import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { currentAppPath } from "../../src/core/brand.ts";
import { resolveResumeTarget } from "../../src/runtime/resume.ts";
import { SessionSnapshotStore } from "../../src/runtime/session-snapshot-store.ts";

function makeSnapshot(
  overrides: Partial<{
    id: string;
    sessionId: string;
    state: "planning" | "executing";
    compactedSummary: string;
    headline: string;
    currentTaskId: string;
    nextStep: string;
    updatedAt: string;
    checkpointId: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "snapshot-1",
    sessionId: overrides.sessionId ?? "session-1",
    state: overrides.state ?? "planning",
    activeArtifacts: {
      required: [
        {
          id: currentAppPath("docs", "specs", "01-plan.md"),
          kind: "plan" as const,
          path: currentAppPath("docs", "specs", "01-plan.md"),
          title: "01-plan",
        },
      ],
      optional: [
        {
          id: currentAppPath("docs", "tasks", "active", "T-001-auth.md"),
          kind: "task" as const,
          path: currentAppPath("docs", "tasks", "active", "T-001-auth.md"),
          title: "T-001-auth",
        },
      ],
      onDemand: [],
    },
    compactedSummary: overrides.compactedSummary ?? "Drafted the task plan and captured open questions.",
    summary: {
      headline: overrides.headline ?? "Continue the auth task from the active workspace docs.",
      currentTaskId: overrides.currentTaskId ?? "T-001-auth",
      nextStep: overrides.nextStep ?? "Run the targeted auth tests before editing.",
    },
    checkpoint: {
      id: overrides.checkpointId ?? "checkpoint-1",
      createdAt: "2026-03-23T10:00:00.000Z",
    },
    updatedAt: overrides.updatedAt ?? "2026-03-23T10:05:00.000Z",
  };
}

async function makeProjectRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "expecto-resume-"));
}

test("session snapshot store saves and loads a snapshot", async () => {
  const projectRoot = await makeProjectRoot();
  const store = new SessionSnapshotStore(projectRoot);
  const snapshot = makeSnapshot();

  await store.save(snapshot);
  const loaded = await store.load(snapshot.id);

  assert.equal(loaded.id, snapshot.id);
  assert.equal(loaded.sessionId, snapshot.sessionId);
  assert.equal(loaded.compactedSummary, snapshot.compactedSummary);
  assert.equal(loaded.summary?.currentTaskId, snapshot.summary.currentTaskId);
});

test("resolveResumeTarget returns the newest snapshot for a session with a resume summary", async () => {
  const projectRoot = await makeProjectRoot();
  const store = new SessionSnapshotStore(projectRoot);

  await store.save(
    makeSnapshot({
      id: "snapshot-older",
      updatedAt: "2026-03-23T10:05:00.000Z",
      compactedSummary: "Older summary",
    }),
  );
  await store.save(
    makeSnapshot({
      id: "snapshot-newer",
      updatedAt: "2026-03-23T10:15:00.000Z",
      compactedSummary: "Newer summary",
      checkpointId: "checkpoint-2",
    }),
  );
  await store.save(
    makeSnapshot({
      id: "snapshot-other-session",
      sessionId: "session-2",
      updatedAt: "2026-03-23T10:20:00.000Z",
    }),
  );

  const resumed = await resolveResumeTarget(store, {
    sessionId: "session-1",
  });

  assert.equal(resumed?.snapshot.id, "snapshot-newer");
  assert.match(resumed?.summary ?? "", /session: session-1/);
  assert.match(resumed?.summary ?? "", /state: planning/);
  // Active artifact listing is intentionally NOT in the resume summary anymore;
  // it is covered by the fresh renderSessionSummary output when the bootstrap
  // pipeline assembles the state layer.
  assert.doesNotMatch(resumed?.summary ?? "", /active artifacts \(required\)/);
  assert.doesNotMatch(resumed?.summary ?? "", /active artifacts \(optional\)/);
  assert.doesNotMatch(resumed?.summary ?? "", /active artifacts \(on-demand\)/);
  assert.match(resumed?.summary ?? "", /headline: Continue the auth task from the active workspace docs\./);
  assert.match(resumed?.summary ?? "", /current task: T-001-auth/);
  assert.match(resumed?.summary ?? "", /next step: Run the targeted auth tests before editing\./);
  assert.match(resumed?.summary ?? "", /compacted summary: Newer summary/);
});

test("resolveResumeTarget returns null when there is no matching snapshot", async () => {
  const projectRoot = await makeProjectRoot();
  const store = new SessionSnapshotStore(projectRoot);

  const resumed = await resolveResumeTarget(store, {
    sessionId: "missing-session",
  });

  assert.equal(resumed, null);
});

test("resolveResumeTarget without a session id returns the latest snapshot overall", async () => {
  const projectRoot = await makeProjectRoot();
  const store = new SessionSnapshotStore(projectRoot);

  await store.save(
    makeSnapshot({
      id: "snapshot-1",
      sessionId: "session-1",
      updatedAt: "2026-03-23T10:05:00.000Z",
      compactedSummary: "Earlier session",
    }),
  );
  await store.save(
    makeSnapshot({
      id: "snapshot-2",
      sessionId: "session-2",
      updatedAt: "2026-03-23T10:25:00.000Z",
      compactedSummary: "Most recent session",
    }),
  );

  const resumed = await resolveResumeTarget(store);

  assert.equal(resumed?.snapshot.id, "snapshot-2");
  assert.match(resumed?.summary ?? "", /session: session-2/);
  assert.match(resumed?.summary ?? "", /headline: Continue the auth task from the active workspace docs\./);
  assert.match(resumed?.summary ?? "", /compacted summary: Most recent session/);
});

test("buildBootstrapContext loads resumeTarget when kind is resume and snapshot exists", async () => {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { buildBootstrapContext } = await import("../../src/runtime/bootstrap-context.ts");
  const { currentAppPath } = await import("../../src/core/brand.ts");

  const projectRoot = await mkdtemp(join(tmpdir(), "expecto-resume-bootstrap-"));
  await mkdir(join(projectRoot, currentAppPath("docs", "specs")), { recursive: true });
  await mkdir(join(projectRoot, currentAppPath("docs", "tasks", "active")), { recursive: true });
  await writeFile(join(projectRoot, currentAppPath("docs", "specs", "00-requirements.md")), "# Requirements\n");
  await writeFile(join(projectRoot, currentAppPath("docs", "specs", "01-plan.md")), "# Plan\n");

  const store = new SessionSnapshotStore(projectRoot);
  await store.save(makeSnapshot({ sessionId: "session-abc", compactedSummary: "auth work in progress" }));

  const context = await buildBootstrapContext({
    command: { kind: "resume" },
    cwd: projectRoot,
  });

  assert.ok(context.resumeTarget, "resumeTarget should be populated");
  assert.equal(context.resumeTarget.snapshot.sessionId, "session-abc");
  assert.match(context.resumeTarget.summary, /session: session-abc/);
  assert.match(context.resumeTarget.summary, /compacted summary: auth work in progress/);
});

test("buildBootstrapContext uses resumeTarget.summary as session_state layer content in resume mode", async () => {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { buildBootstrapContext } = await import("../../src/runtime/bootstrap-context.ts");
  const { currentAppPath } = await import("../../src/core/brand.ts");

  const projectRoot = await mkdtemp(join(tmpdir(), "expecto-resume-state-"));
  await mkdir(join(projectRoot, currentAppPath("docs", "specs")), { recursive: true });
  await mkdir(join(projectRoot, currentAppPath("docs", "tasks", "active")), { recursive: true });
  await writeFile(join(projectRoot, currentAppPath("docs", "specs", "00-requirements.md")), "# Requirements\n");
  await writeFile(join(projectRoot, currentAppPath("docs", "specs", "01-plan.md")), "# Plan\n");

  const store = new SessionSnapshotStore(projectRoot);
  await store.save(makeSnapshot({ sessionId: "session-state-test", compactedSummary: "auth checkpoint" }));

  const context = await buildBootstrapContext({
    command: { kind: "resume" },
    cwd: projectRoot,
  });

  const stateLayer = context.instructionStack?.find((layer) => layer.kind === "session_state");
  assert.ok(stateLayer, "session_state layer should exist");
  assert.match(stateLayer.content, /session: session-state-test/, "state layer should contain resume target summary");
  assert.match(stateLayer.content, /compacted summary: auth checkpoint/);

  // Issue 1 fix: state layer on resume must ALSO include the fresh layered
  // renderSessionSummary output, not only the resume-specific metadata.
  assert.match(stateLayer.content, /\nartifacts:\n/, "state layer should include renderSessionSummary artifacts block");
  assert.match(
    stateLayer.content,
    /\n {2}\[required]/,
    "state layer should contain layered [required]/[optional]/[onDemand] rows",
  );
  // And the OLD overlapping lines must no longer appear
  assert.doesNotMatch(stateLayer.content, /active artifacts \(required\):/);
  assert.doesNotMatch(stateLayer.content, /active artifacts \(optional\):/);
  assert.doesNotMatch(stateLayer.content, /active artifacts \(on-demand\):/);
});

test("buildBootstrapContext sets resumeTarget to undefined when no snapshot exists", async () => {
  const { mkdtemp, mkdir } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { buildBootstrapContext } = await import("../../src/runtime/bootstrap-context.ts");

  const projectRoot = await mkdtemp(join(tmpdir(), "expecto-resume-empty-"));
  await mkdir(join(projectRoot, ".expecto-cli"), { recursive: true });

  const context = await buildBootstrapContext({
    command: { kind: "resume" },
    cwd: projectRoot,
  });

  assert.equal(context.resumeTarget, undefined);
});

test("buildBootstrapContext does not populate resumeTarget for non-resume commands", async () => {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { buildBootstrapContext } = await import("../../src/runtime/bootstrap-context.ts");
  const { currentAppPath } = await import("../../src/core/brand.ts");

  const projectRoot = await mkdtemp(join(tmpdir(), "expecto-resume-interactive-"));
  await mkdir(join(projectRoot, currentAppPath("docs", "specs")), { recursive: true });
  await writeFile(join(projectRoot, currentAppPath("docs", "specs", "00-requirements.md")), "# Requirements\n");

  const context = await buildBootstrapContext({
    command: { kind: "interactive" },
    cwd: projectRoot,
  });

  assert.equal(context.resumeTarget, undefined);
});

test("buildBootstrapContext on resume rehydrates onDemand refs into loadedArtifacts.onDemand", async () => {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { buildBootstrapContext } = await import("../../src/runtime/bootstrap-context.ts");
  const { currentAppPath } = await import("../../src/core/brand.ts");

  const projectRoot = await mkdtemp(join(tmpdir(), "expecto-resume-ondemand-"));
  await mkdir(join(projectRoot, currentAppPath("docs", "specs")), { recursive: true });
  await writeFile(join(projectRoot, currentAppPath("docs", "specs", "00-requirements.md")), "# Requirements\n");
  await writeFile(join(projectRoot, currentAppPath("docs", "specs", "01-plan.md")), "# Plan\n");
  await writeFile(
    join(projectRoot, currentAppPath("docs", "findings.md")),
    "# Findings\n\nEvidence of prior auth research.\n",
  );

  const findingsRef = {
    id: currentAppPath("docs", "findings.md"),
    kind: "finding" as const,
    path: currentAppPath("docs", "findings.md"),
    title: "findings",
  };

  const snapshot = makeSnapshot({ sessionId: "session-ondemand" });
  const snapshotWithOnDemand = {
    ...snapshot,
    activeArtifacts: {
      ...snapshot.activeArtifacts,
      onDemand: [findingsRef],
    },
  };

  const store = new SessionSnapshotStore(projectRoot);
  await store.save(snapshotWithOnDemand);

  const context = await buildBootstrapContext({
    command: { kind: "resume" },
    cwd: projectRoot,
  });

  // 1. activeArtifacts.onDemand recovered from snapshot (refs)
  assert.deepEqual(
    context.activeArtifacts.onDemand.map((ref) => ref.id),
    [findingsRef.id],
  );
  assert.equal(context.activeArtifacts.onDemand[0]?.title, "findings");

  // 2. loadedArtifacts.onDemand populated with eager-read docs (content)
  assert.equal(
    context.loadedArtifacts.onDemand.length,
    1,
    "loadedArtifacts.onDemand should contain the eager-read finding",
  );
  assert.equal(context.loadedArtifacts.onDemand[0]?.id, findingsRef.id);
  assert.match(
    context.loadedArtifacts.onDemand[0]?.content ?? "",
    /Evidence of prior auth research/,
  );

  // 3. instructionStack must NOT receive an onDemand artifact layer
  // Only required artifacts become artifact_summary layers (see instruction-resolver).
  // Onboarding onDemand into prompt layers is explicitly deferred to Phase C budgeting.
  const artifactLayerPaths = (context.instructionStack ?? [])
    .filter((layer) => layer.kind === "artifact_summary")
    .map((layer) => layer.path);

  assert.ok(
    !artifactLayerPaths.includes(findingsRef.path),
    `instructionStack should not contain onDemand artifact ${findingsRef.path}, got layers: ${artifactLayerPaths.join(",")}`,
  );
});

test("buildBootstrapContext on non-resume returns empty loadedArtifacts.onDemand", async () => {
  const { mkdtemp, mkdir, writeFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { buildBootstrapContext } = await import("../../src/runtime/bootstrap-context.ts");
  const { currentAppPath } = await import("../../src/core/brand.ts");

  const projectRoot = await mkdtemp(join(tmpdir(), "expecto-interactive-ondemand-"));
  await mkdir(join(projectRoot, currentAppPath("docs", "specs")), { recursive: true });
  await writeFile(join(projectRoot, currentAppPath("docs", "specs", "00-requirements.md")), "# Requirements\n");
  await writeFile(join(projectRoot, currentAppPath("docs", "specs", "01-plan.md")), "# Plan\n");
  await writeFile(join(projectRoot, currentAppPath("docs", "findings.md")), "# Findings\n");

  const context = await buildBootstrapContext({
    command: { kind: "interactive" },
    cwd: projectRoot,
  });

  // Resolver puts findings under activeArtifacts.onDemand by default, but on a fresh
  // bootstrap we do not eager-load them into loadedArtifacts.onDemand. That stays empty
  // until a resume path explicitly rehydrates.
  assert.ok(context.activeArtifacts.onDemand.length > 0, "resolver should surface onDemand refs");
  assert.deepEqual(context.loadedArtifacts.onDemand, []);
});
