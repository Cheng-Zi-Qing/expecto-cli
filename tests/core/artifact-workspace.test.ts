import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { currentAppPath } from "../../src/core/brand.ts";
import { ArtifactWorkspace } from "../../src/core/artifact-workspace.ts";

async function makeProjectRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "expecto-workspace-"));
}

test("artifact workspace initializes the standard docs skeleton", async () => {
  const projectRoot = await makeProjectRoot();
  const workspace = new ArtifactWorkspace(projectRoot);

  const result = await workspace.ensureInitialized();

  const index = await readFile(
    join(projectRoot, currentAppPath("docs", "index.md")),
    "utf8",
  );
  const requirements = await readFile(
    join(projectRoot, currentAppPath("docs", "specs", "00-requirements.md")),
    "utf8",
  );
  const plan = await readFile(
    join(projectRoot, currentAppPath("docs", "specs", "01-plan.md")),
    "utf8",
  );
  const specs = await stat(join(projectRoot, currentAppPath("docs", "specs")));
  const tasksActive = await stat(join(projectRoot, currentAppPath("docs", "tasks", "active")));
  const tasksBacklog = await stat(join(projectRoot, currentAppPath("docs", "tasks", "backlog")));
  const decisions = await stat(join(projectRoot, currentAppPath("docs", "decisions")));
  const summaries = await stat(join(projectRoot, currentAppPath("docs", "summaries")));

  assert.match(index, /^# Project Workspace\b/m);
  assert.match(index, /Active Tasks/);
  assert.match(requirements, /^# Requirements\b/m);
  assert.match(plan, /^# Plan\b/m);
  assert.equal(specs.isDirectory(), true);
  assert.equal(tasksActive.isDirectory(), true);
  assert.equal(tasksBacklog.isDirectory(), true);
  assert.equal(decisions.isDirectory(), true);
  assert.equal(summaries.isDirectory(), true);
  assert.equal(result.files.length, 4);
  assert.ok(result.files.every((f) => f.action === "created"));
});

test("artifact workspace does not overwrite existing baseline docs", async () => {
  const projectRoot = await makeProjectRoot();
  const workspace = new ArtifactWorkspace(projectRoot);
  const docsRoot = join(projectRoot, currentAppPath("docs"));
  const customRequirements = "# Requirements\n\nCustom scope.\n";

  await mkdir(join(docsRoot, "specs"), { recursive: true });
  await writeFile(join(docsRoot, "specs", "00-requirements.md"), customRequirements, "utf8");
  await workspace.ensureInitialized();

  const requirements = await readFile(
    join(projectRoot, currentAppPath("docs", "specs", "00-requirements.md")),
    "utf8",
  );

  assert.equal(requirements, customRequirements);
});
