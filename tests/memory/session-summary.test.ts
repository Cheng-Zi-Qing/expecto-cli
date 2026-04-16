import test from "node:test";
import assert from "node:assert/strict";

import { renderSessionSummary } from "../../src/memory/session-summary.ts";
import type { ArtifactRef } from "../../src/contracts/artifact-schema.ts";

function requirementsRef(): ArtifactRef {
  return {
    id: ".expecto-cli/docs/specs/00-requirements.md",
    kind: "requirements",
    path: ".expecto-cli/docs/specs/00-requirements.md",
    title: "00-requirements",
  };
}

function planRef(): ArtifactRef {
  return {
    id: ".expecto-cli/docs/specs/01-plan.md",
    kind: "plan",
    path: ".expecto-cli/docs/specs/01-plan.md",
    title: "01-plan",
    status: "active",
  };
}

function summaryRef(): ArtifactRef {
  return {
    id: ".expecto-cli/docs/summaries/T-001-2026-04-16.md",
    kind: "summary",
    path: ".expecto-cli/docs/summaries/T-001-2026-04-16.md",
    title: "T-001-2026-04-16",
  };
}

function findingRef(): ArtifactRef {
  return {
    id: ".expecto-cli/docs/findings.md",
    kind: "finding",
    path: ".expecto-cli/docs/findings.md",
    title: "findings",
  };
}

test("renderSessionSummary emits mode, instructions and memory headers", () => {
  const output = renderSessionSummary({
    mode: "balanced",
    instructions: [{ path: "AGENTS.md", content: "" }],
    memory: [{ path: ".expecto-cli/memory/INDEX.md", content: "" }],
    artifacts: {
      required: [],
      optional: [],
      onDemand: [],
    },
  });

  const lines = output.split("\n");

  assert.equal(lines[0], "mode: balanced");
  assert.equal(lines[1], "instructions: AGENTS.md");
  assert.equal(lines[2], "memory: .expecto-cli/memory/INDEX.md");
});

test("renderSessionSummary prints none in each layer when empty", () => {
  const output = renderSessionSummary({
    mode: "balanced",
    instructions: [],
    memory: [],
    artifacts: {
      required: [],
      optional: [],
      onDemand: [],
    },
  });

  const artifactBlock = output.split("artifacts:\n")[1] ?? "";

  assert.equal(
    artifactBlock,
    [
      "  [required]  none",
      "  [optional]  none",
      "  [onDemand]  none",
    ].join("\n"),
  );
});

test("renderSessionSummary always prints all three layers even if some are empty", () => {
  const output = renderSessionSummary({
    mode: "balanced",
    instructions: [],
    memory: [],
    artifacts: {
      required: [requirementsRef()],
      optional: [],
      onDemand: [findingRef()],
    },
  });

  assert.match(output, /\n {2}\[required]  00-requirements \(\.expecto-cli\/docs\/specs\/00-requirements\.md\)\n/);
  assert.match(output, /\n {2}\[optional]  none\n/);
  assert.match(output, /\n {2}\[onDemand]  findings \(\.expecto-cli\/docs\/findings\.md\)$/);
});

test("renderSessionSummary renders active artifact refs, not loaded docs", () => {
  const output = renderSessionSummary({
    mode: "balanced",
    instructions: [],
    memory: [],
    artifacts: {
      required: [requirementsRef(), planRef()],
      optional: [summaryRef()],
      onDemand: [findingRef()],
    },
  });

  assert.match(
    output,
    /\n {2}\[required]  00-requirements \(\.expecto-cli\/docs\/specs\/00-requirements\.md\)/,
  );
  assert.match(
    output,
    /\n {2}\[required]  01-plan \(\.expecto-cli\/docs\/specs\/01-plan\.md\) \[active]/,
  );
  assert.match(
    output,
    /\n {2}\[optional]  T-001-2026-04-16 \(\.expecto-cli\/docs\/summaries\/T-001-2026-04-16\.md\)/,
  );
  assert.match(
    output,
    /\n {2}\[onDemand]  findings \(\.expecto-cli\/docs\/findings\.md\)/,
  );
});

test("renderSessionSummary only appends [status] when a ref carries a non-empty status", () => {
  const output = renderSessionSummary({
    mode: "balanced",
    instructions: [],
    memory: [],
    artifacts: {
      required: [requirementsRef(), planRef()],
      optional: [],
      onDemand: [],
    },
  });

  // requirementsRef has no status -> no trailing [status] segment
  assert.match(
    output,
    /\n {2}\[required]  00-requirements \(\.expecto-cli\/docs\/specs\/00-requirements\.md\)\n/,
  );
  // planRef has status: active
  assert.match(
    output,
    /\n {2}\[required]  01-plan \(\.expecto-cli\/docs\/specs\/01-plan\.md\) \[active]\n/,
  );
});

test("renderSessionSummary does not expose refs vs docs distinction anywhere in output", () => {
  const output = renderSessionSummary({
    mode: "balanced",
    instructions: [],
    memory: [],
    artifacts: {
      required: [requirementsRef()],
      optional: [summaryRef()],
      onDemand: [findingRef()],
    },
  });

  assert.doesNotMatch(output, /required docs/);
  assert.doesNotMatch(output, /optional refs/);
  assert.doesNotMatch(output, /optional docs/);
});

test("renderSessionSummary lists multiple instructions and memory paths joined with comma-space", () => {
  const output = renderSessionSummary({
    mode: "balanced",
    instructions: [
      { path: "AGENTS.md", content: "" },
      { path: "CLAUDE.md", content: "" },
    ],
    memory: [
      { path: ".expecto-cli/memory/INDEX.md", content: "" },
      { path: ".expecto-cli/memory/conventions.md", content: "" },
    ],
    artifacts: {
      required: [],
      optional: [],
      onDemand: [],
    },
  });

  assert.match(output, /\ninstructions: AGENTS\.md, CLAUDE\.md\n/);
  assert.match(
    output,
    /\nmemory: \.expecto-cli\/memory\/INDEX\.md, \.expecto-cli\/memory\/conventions\.md\n/,
  );
});

test("renderSessionSummary prints 'none' for empty instructions and memory", () => {
  const output = renderSessionSummary({
    mode: "balanced",
    instructions: [],
    memory: [],
    artifacts: {
      required: [],
      optional: [],
      onDemand: [],
    },
  });

  assert.match(output, /\ninstructions: none\n/);
  assert.match(output, /\nmemory: none\n/);
});
