import assert from "node:assert/strict";
import test from "node:test";

import { projectStickyScreenState } from "../../../src/tui/sticky-screen/presentation-surface.ts";
import type { TuiState } from "../../../src/tui/tui-types.ts";

function createState(overrides: Partial<TuiState> = {}): TuiState {
  return {
    sessionId: "session-1",
    focus: "composer",
    timelineMode: "scroll",
    inspectorOpen: false,
    runtimeState: "ready",
    commandMenu: {
      visible: false,
      query: "",
      items: [],
      selectedIndex: 0,
    },
    timeline: [],
    selectedTimelineIndex: 0,
    draft: "",
    inputLocked: false,
    projectLabel: "beta-agent",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude",
    contextMetrics: {
      percent: 0,
      rules: 0,
      hooks: 0,
      docs: 0,
    },
    ...overrides,
    activeThemeId: overrides.activeThemeId ?? "hufflepuff",
    themePicker: overrides.themePicker ?? null,
    activeRequestLedger: overrides.activeRequestLedger ?? null,
  };
}

test("projectStickyScreenState maps runtime state into sticky status and locked composer placeholder", () => {
  const projection = projectStickyScreenState(
    createState({
      runtimeState: "tool_running",
      inputLocked: true,
    }),
    80,
  );

  assert.deepEqual(projection.activeStatus, {
    kind: "executing",
    text: "Running tool...",
  });
  assert.equal(projection.composer.locked, true);
  assert.equal(projection.composer.hidden, false);
  assert.equal(projection.composer.placeholder, "Waiting for response...");
  assert.equal(projection.composer.statusLabel, "Running tool");
});

test("projectStickyScreenState hides an empty pending assistant thinking placeholder from transcript output", () => {
  const projection = projectStickyScreenState(
    createState({
      runtimeState: "streaming",
      timeline: [
        {
          id: "user-1",
          kind: "user",
          summary: "hello",
          body: "hello",
          collapsed: false,
        },
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "Thinking...",
          body: "",
          collapsed: false,
          requestId: "request-1",
          responseId: "response-1",
        },
      ],
    }),
    80,
  );

  const output = projection.transcriptLines.join("\n");

  assert.match(output, /hello/);
  assert.doesNotMatch(output, /Thinking/);
});
