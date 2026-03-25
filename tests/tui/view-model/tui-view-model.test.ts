import assert from "node:assert/strict";
import test from "node:test";

import type { TuiState } from "../../../src/tui/tui-types.ts";
import { buildTuiViewModel } from "../../../src/tui/view-model/tui-view-model.ts";

function createSampleTuiState(overrides: Partial<TuiState> = {}): TuiState {
  return {
    sessionId: "session-1",
    focus: "composer",
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
  };
}

test("buildTuiViewModel derives transcript blocks and footer state from TuiState", () => {
  const state = createSampleTuiState({
    draft: "inspect auth flow",
    inputLocked: true,
    runtimeState: "streaming",
    selectedTimelineIndex: 1,
    timeline: [
      { id: "user-1", kind: "user", summary: "inspect auth flow", body: "inspect auth flow" },
      { id: "assistant-1", kind: "assistant", summary: "reading files", body: "reading files" },
    ],
  });

  const view = buildTuiViewModel(state);

  assert.equal(view.transcript.blocks.length, 2);
  assert.equal(view.transcript.blocks[0]?.selected, false);
  assert.equal(view.transcript.blocks[1]?.selected, true);
  assert.equal(view.overlay, null);
  assert.equal(view.footer.composer.value, "inspect auth flow");
  assert.equal(view.footer.composer.locked, true);
  assert.equal(view.footer.status.runtimeLabel, "Thinking");
});
