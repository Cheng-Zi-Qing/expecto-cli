import test from "node:test";
import assert from "node:assert/strict";

import { currentAppPath } from "../../src/core/brand.ts";
import {
  activeArtifactSetSchema,
  artifactKindSchema,
  artifactRefSchema,
  artifactWriteInputSchema,
} from "../../src/contracts/artifact-schema.ts";
import { runtimeEventSchema } from "../../src/contracts/event-schema.ts";
import { sessionSnapshotSchema } from "../../src/contracts/session-snapshot-schema.ts";
import { taskPacketSchema } from "../../src/contracts/task-packet-schema.ts";
import { toolResultSchema } from "../../src/contracts/tool-result-schema.ts";

test("artifact kind accepts known values", () => {
  const parsed = artifactKindSchema.parse("task");

  assert.equal(parsed, "task");
});

test("artifact reference rejects unknown kinds", () => {
  assert.throws(
    () =>
      artifactRefSchema.parse({
        id: "a1",
        kind: "unknown",
        path: currentAppPath("docs", "tasks", "T-001.md"),
        title: "Task 1",
      }),
    /Invalid enum value/,
  );
});

test("artifact write input accepts markdown content and metadata", () => {
  const parsed = artifactWriteInputSchema.parse({
    kind: "summary",
    path: currentAppPath("docs", "summaries", "T-001-2026-03-23.md"),
    title: "Task 1 Summary",
    content: "# Summary",
    metadata: {
      taskId: "T-001",
    },
  });

  assert.equal(parsed.kind, "summary");
  assert.equal(parsed.metadata?.taskId, "T-001");
});

test("artifact reference accepts lifecycle metadata for workspace orchestration", () => {
  const parsed = artifactRefSchema.parse({
    id: currentAppPath("docs", "tasks", "T-001-auth.md"),
    kind: "task",
    path: currentAppPath("docs", "tasks", "T-001-auth.md"),
    title: "T-001-auth",
    status: "in_progress",
    metadata: {
      initiativeId: "auth-refresh",
      taskId: "T-001-auth",
      updatedAt: "2026-03-24T09:00:00.000Z",
    },
  });

  assert.equal(parsed.metadata?.initiativeId, "auth-refresh");
  assert.equal(parsed.metadata?.taskId, "T-001-auth");
});

test("active artifact set supports required, optional, and on-demand groups", () => {
  const parsed = activeArtifactSetSchema.parse({
    required: [
      {
        id: "requirements",
        kind: "requirements",
        path: currentAppPath("docs", "00-requirements.md"),
        title: "Requirements",
      },
    ],
    optional: [],
    onDemand: [],
  });

  assert.equal(parsed.required[0]?.kind, "requirements");
});

test("tool result accepts a successful tool execution", () => {
  const parsed = toolResultSchema.parse({
    tool: "read",
    success: true,
    data: {
      lines: 20,
    },
    metadata: {
      durationMs: 10,
      sideEffects: [],
    },
  });

  assert.equal(parsed.success, true);
});

test("tool result rejects a failed tool execution without error details", () => {
  assert.throws(
    () =>
      toolResultSchema.parse({
        tool: "bash",
        success: false,
        metadata: {
          durationMs: 20,
          sideEffects: ["workspace"],
        },
      }),
    /error/,
  );
});

test("task packet accepts a reviewer packet with constraints", () => {
  const parsed = taskPacketSchema.parse({
    role: "reviewer",
    objective: "Check auth regression risk",
    context: {
      files: ["src/auth.ts"],
      constraints: ["read only"],
    },
    outputFormat: "markdown",
    maxTurns: 3,
  });

  assert.equal(parsed.role, "reviewer");
});

test("runtime event accepts a tool event", () => {
  const parsed = runtimeEventSchema.parse({
    type: "tool:post",
    sessionId: "session-1",
    timestamp: "2026-03-23T10:00:00.000Z",
    payload: {
      tool: "read",
    },
  });

  assert.equal(parsed.type, "tool:post");
});

test("session snapshot accepts active artifacts and session state", () => {
  const parsed = sessionSnapshotSchema.parse({
    id: "snapshot-1",
    sessionId: "session-1",
    state: "planning",
    activeArtifacts: {
      required: [
        {
          id: "plan",
          kind: "plan",
          path: currentAppPath("docs", "01-plan.md"),
          title: "Plan",
        },
      ],
      optional: [],
      onDemand: [],
    },
    compactedSummary: "Current planning summary",
    summary: {
      headline: "Planning auth refresh migration",
      currentTaskId: "T-001-auth",
      nextStep: "Open the active task and confirm acceptance criteria",
    },
    checkpoint: {
      id: "checkpoint-1",
      createdAt: "2026-03-23T10:00:00.000Z",
    },
    updatedAt: "2026-03-23T10:05:00.000Z",
  });

  assert.equal(parsed.state, "planning");
  assert.equal(parsed.summary?.currentTaskId, "T-001-auth");
});
