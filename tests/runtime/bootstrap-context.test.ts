import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { currentAppPath } from "../../src/core/brand.ts";
import { buildBootstrapContext } from "../../src/runtime/bootstrap-context.ts";

const docsRoot = currentAppPath("docs");
const memoryRoot = currentAppPath("memory");

async function makeProjectRoot(options: { includeAgents?: boolean; includeMemoryIndex?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "expecto-runtime-"));
  await mkdir(join(root, docsRoot, "tasks"), { recursive: true });
  await mkdir(join(root, docsRoot, "summaries"), { recursive: true });
  await mkdir(join(root, memoryRoot), { recursive: true });

  await writeFile(join(root, docsRoot, "00-requirements.md"), "# Requirements\n");
  await writeFile(join(root, docsRoot, "01-plan.md"), "# Plan\n");
  await writeFile(join(root, docsRoot, "tasks", "T-001-auth.md"), "# Task\n");
  await writeFile(join(root, docsRoot, "summaries", "T-001-2026-03-23.md"), "# Summary\n");
  await writeFile(join(root, docsRoot, "findings.md"), "# Findings\n");

  if (options.includeAgents !== false) {
    await writeFile(join(root, "AGENTS.md"), "# Project Instructions\n");
  }

  if (options.includeMemoryIndex !== false) {
    await writeFile(join(root, memoryRoot, "INDEX.md"), "# Memory Index\n");
  }

  return root;
}

test("buildBootstrapContext loads project instructions, memory index, and active docs", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: { kind: "interactive" },
    cwd: projectRoot,
    activeTaskId: "T-001-auth",
  });

  assert.equal(context.instructions.length, 1);
  assert.equal(context.instructions[0]?.path, "AGENTS.md");
  assert.match(context.instructions[0]?.content ?? "", /Project Instructions/);

  assert.equal(context.memory.length, 1);
  assert.equal(context.memory[0]?.path, currentAppPath("memory", "INDEX.md"));
  assert.match(context.memory[0]?.content ?? "", /Memory Index/);

  assert.deepEqual(
    context.activeArtifacts.required.map((artifact) => artifact.kind),
    ["requirements", "plan", "task"],
  );
  assert.deepEqual(
    context.loadedArtifacts.required.map((artifact) => artifact.title),
    ["00-requirements", "01-plan", "T-001-auth"],
  );
  assert.deepEqual(context.loadedArtifacts.optional, []);
  assert.deepEqual(context.activeArtifacts.optional.map((artifact) => artifact.kind), ["summary"]);
  assert.deepEqual(
    context.instructionStack?.map((layer) => layer.kind),
    ["identity", "mode", "project_instruction", "artifact_summary", "artifact_summary", "artifact_summary", "session_state"],
  );
  assert.equal(context.instructionStack?.[0]?.title, "expecto-cli-identity");
  assert.equal(context.instructionStack?.[1]?.title, "mode-balanced");
  assert.equal(context.instructionStack?.[2]?.path, "AGENTS.md");
  assert.match(context.sessionSummary ?? "", /T-001-auth/);
  assert.match(context.sessionSummary ?? "", /mode: balanced/);
  assert.match(context.sessionSummary ?? "", /optional refs: T-001-2026-03-23/);
});

test("buildBootstrapContext tolerates missing optional instruction and memory files", async () => {
  const projectRoot = await makeProjectRoot({
    includeAgents: false,
    includeMemoryIndex: false,
  });
  const context = await buildBootstrapContext({
    command: { kind: "print", prompt: "status" },
    cwd: projectRoot,
  });

  assert.deepEqual(context.instructions, []);
  assert.deepEqual(context.memory, []);
  assert.deepEqual(
    context.activeArtifacts.required.map((artifact) => artifact.kind),
    ["requirements", "plan"],
  );
  assert.deepEqual(context.activeArtifacts.optional.map((artifact) => artifact.kind), ["summary"]);
  assert.deepEqual(context.loadedArtifacts.optional, []);
  assert.deepEqual(
    context.instructionStack?.map((layer) => layer.kind),
    ["identity", "mode", "artifact_summary", "artifact_summary", "session_state"],
  );
  assert.match(context.sessionSummary ?? "", /mode: balanced/);
});
