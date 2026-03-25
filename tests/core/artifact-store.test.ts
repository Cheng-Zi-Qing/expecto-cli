import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ActiveArtifactResolver } from "../../src/core/active-artifact-resolver.ts";
import { ArtifactStore } from "../../src/core/artifact-store.ts";

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "beta-agent-"));
  await mkdir(join(root, ".beta-agent", "docs", "tasks"), { recursive: true });
  await mkdir(join(root, ".beta-agent", "docs", "summaries"), { recursive: true });
  await mkdir(join(root, ".beta-agent", "memory"), { recursive: true });

  await writeFile(join(root, ".beta-agent", "docs", "00-requirements.md"), "# Requirements\n");
  await writeFile(join(root, ".beta-agent", "docs", "01-plan.md"), "# Plan\n");
  await writeFile(join(root, ".beta-agent", "docs", "tasks", "T-001-auth.md"), "# Task 1\n");
  await writeFile(join(root, ".beta-agent", "docs", "summaries", "T-001-2026-03-23.md"), "# Summary 1\n");
  await writeFile(join(root, ".beta-agent", "docs", "findings.md"), "# Findings\n");
  await writeFile(join(root, ".beta-agent", "memory", "INDEX.md"), "# Memory Index\n");

  return root;
}

test("artifact store lists known project docs by kind", async () => {
  const projectRoot = await makeProjectRoot();
  const store = new ArtifactStore(projectRoot);

  const tasks = await store.list("task");
  const summaries = await store.list("summary");
  const requirements = await store.list("requirements");

  assert.equal(tasks.length, 1);
  assert.equal(summaries.length, 1);
  assert.equal(requirements.length, 1);
  assert.equal(tasks[0]?.title, "T-001-auth");
});

test("artifact store writes and reads a summary artifact", async () => {
  const projectRoot = await makeProjectRoot();
  const store = new ArtifactStore(projectRoot);

  const ref = await store.write({
    kind: "summary",
    path: ".beta-agent/docs/summaries/T-001-2026-03-24.md",
    title: "T-001-2026-03-24",
    content: "# Summary 2\n",
    status: "completed",
    metadata: {
      taskId: "T-001-auth",
      updatedAt: "2026-03-24T09:00:00.000Z",
    },
  });

  const doc = await store.read(ref.id);
  const content = await readFile(
    join(projectRoot, ".beta-agent", "docs", "summaries", "T-001-2026-03-24.md"),
    "utf8",
  );

  assert.equal(doc.title, "T-001-2026-03-24");
  assert.equal(doc.status, "completed");
  assert.equal(doc.metadata?.taskId, "T-001-auth");
  assert.match(content, /status: completed/);
  assert.match(content, /taskId: T-001-auth/);
  assert.match(content, /# Summary 2/);
});

test("active artifact resolver prioritizes requirements, plan, active task, and latest summary", async () => {
  const projectRoot = await makeProjectRoot();
  const store = new ArtifactStore(projectRoot);
  const resolver = new ActiveArtifactResolver(store);

  const resolved = await resolver.resolve({
    activeTaskId: "T-001-auth",
  });

  assert.deepEqual(
    resolved.required.map((artifact) => artifact.kind),
    ["requirements", "plan", "task"],
  );
  assert.deepEqual(
    resolved.optional.map((artifact) => artifact.kind),
    ["summary"],
  );
  assert.deepEqual(
    resolved.onDemand.map((artifact) => artifact.kind),
    ["finding"],
  );
});

test("active artifact resolver can use summary metadata to prefer the latest summary for the active task", async () => {
  const projectRoot = await makeProjectRoot();
  const store = new ArtifactStore(projectRoot);
  const resolver = new ActiveArtifactResolver(store);

  await store.write({
    kind: "summary",
    path: ".beta-agent/docs/summaries/daily-checkpoint-2026-03-24.md",
    title: "daily-checkpoint-2026-03-24",
    content: "# Daily checkpoint\n",
    metadata: {
      taskId: "T-001-auth",
      updatedAt: "2026-03-24T09:30:00.000Z",
    },
  });

  await store.write({
    kind: "summary",
    path: ".beta-agent/docs/summaries/other-task-2026-03-24.md",
    title: "other-task-2026-03-24",
    content: "# Other task checkpoint\n",
    metadata: {
      taskId: "T-999-other",
      updatedAt: "2026-03-24T10:30:00.000Z",
    },
  });

  const resolved = await resolver.resolve({
    activeTaskId: "T-001-auth",
  });

  assert.equal(resolved.optional[0]?.title, "daily-checkpoint-2026-03-24");
  assert.equal(resolved.optional[0]?.metadata?.taskId, "T-001-auth");
});
