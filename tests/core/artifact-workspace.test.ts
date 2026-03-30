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

  await workspace.ensureInitialized();

  const requirements = await readFile(
    join(projectRoot, currentAppPath("docs", "00-requirements.md")),
    "utf8",
  );
  const plan = await readFile(
    join(projectRoot, currentAppPath("docs", "01-plan.md")),
    "utf8",
  );
  const tasks = await stat(join(projectRoot, currentAppPath("docs", "tasks")));
  const summaries = await stat(join(projectRoot, currentAppPath("docs", "summaries")));

  assert.match(requirements, /^# Requirements\b/m);
  assert.match(plan, /^# Plan\b/m);
  assert.equal(tasks.isDirectory(), true);
  assert.equal(summaries.isDirectory(), true);
});

test("artifact workspace does not overwrite existing baseline docs", async () => {
  const projectRoot = await makeProjectRoot();
  const workspace = new ArtifactWorkspace(projectRoot);
  const docsRoot = join(projectRoot, currentAppPath("docs"));
  const customRequirements = "# Requirements\n\nCustom scope.\n";

  await mkdir(docsRoot, { recursive: true });
  await writeFile(join(docsRoot, "00-requirements.md"), customRequirements, "utf8");
  await workspace.ensureInitialized();

  const requirements = await readFile(
    join(projectRoot, currentAppPath("docs", "00-requirements.md")),
    "utf8",
  );

  assert.equal(requirements, customRequirements);
});
