import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBootstrapContext } from "../../src/runtime/bootstrap-context.ts";

async function makeProjectRoot(options: { includeAgents?: boolean; includeMemoryIndex?: boolean } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "beta-agent-runtime-"));
  await mkdir(join(root, ".beta-agent", "docs", "tasks"), { recursive: true });
  await mkdir(join(root, ".beta-agent", "docs", "summaries"), { recursive: true });
  await mkdir(join(root, ".beta-agent", "memory"), { recursive: true });

  await writeFile(join(root, ".beta-agent", "docs", "00-requirements.md"), "# Requirements\n");
  await writeFile(join(root, ".beta-agent", "docs", "01-plan.md"), "# Plan\n");
  await writeFile(join(root, ".beta-agent", "docs", "tasks", "T-001-auth.md"), "# Task\n");
  await writeFile(join(root, ".beta-agent", "docs", "summaries", "T-001-2026-03-23.md"), "# Summary\n");
  await writeFile(join(root, ".beta-agent", "docs", "findings.md"), "# Findings\n");

  if (options.includeAgents !== false) {
    await writeFile(join(root, "AGENTS.md"), "# Project Instructions\n");
  }

  if (options.includeMemoryIndex !== false) {
    await writeFile(join(root, ".beta-agent", "memory", "INDEX.md"), "# Memory Index\n");
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
  assert.equal(context.memory[0]?.path, ".beta-agent/memory/INDEX.md");
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
    ["identity", "mode", "project_instruction", "artifact_summary", "artifact_summary", "artifact_summary"],
  );
  assert.equal(context.instructionStack?.[0]?.title, "beta-identity");
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
    ["identity", "mode", "artifact_summary", "artifact_summary"],
  );
  assert.match(context.sessionSummary ?? "", /mode: balanced/);
});
