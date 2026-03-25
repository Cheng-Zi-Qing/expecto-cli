import test from "node:test";
import assert from "node:assert/strict";

import { resolveInstructionSet } from "../../src/runtime/instruction-resolver.ts";

test("instruction resolver builds runtime, project, and artifact layers in priority order", () => {
  const resolved = resolveInstructionSet({
    mode: "balanced",
    instructions: [
      {
        path: "AGENTS.md",
        content: "# Project Instructions\n",
      },
    ],
    requiredArtifacts: [
      {
        id: ".beta-agent/docs/00-requirements.md",
        kind: "requirements",
        path: ".beta-agent/docs/00-requirements.md",
        title: "00-requirements",
        content: "# Requirements\n\nBuild a Markdown-driven runtime.\n",
      },
      {
        id: ".beta-agent/docs/01-plan.md",
        kind: "plan",
        path: ".beta-agent/docs/01-plan.md",
        title: "01-plan",
        content: "# Plan\n\nCurrent phase: foundation.\n",
      },
    ],
    optionalArtifacts: [
      {
        id: ".beta-agent/docs/summaries/T-001-2026-03-24.md",
        kind: "summary",
        path: ".beta-agent/docs/summaries/T-001-2026-03-24.md",
        title: "T-001-2026-03-24",
      },
    ],
  });

  assert.deepEqual(
    resolved.promptLayers.map((layer) => layer.kind),
    ["identity", "mode", "project_instruction", "artifact_summary", "artifact_summary"],
  );
  assert.equal(resolved.promptLayers[0]?.title, "beta-identity");
  assert.equal(resolved.promptLayers[1]?.title, "mode-balanced");
  assert.equal(resolved.promptLayers[2]?.path, "AGENTS.md");
  assert.deepEqual(
    resolved.optionalArtifactRefs.map((artifact) => artifact.title),
    ["T-001-2026-03-24"],
  );
});

test("instruction resolver keeps memory documents out of prompt layers", () => {
  const resolved = resolveInstructionSet({
    mode: "strict",
    instructions: [],
    requiredArtifacts: [],
    optionalArtifacts: [],
  });

  assert.equal(
    resolved.promptLayers.some((layer) => layer.path === ".beta-agent/memory/INDEX.md"),
    false,
  );
});
