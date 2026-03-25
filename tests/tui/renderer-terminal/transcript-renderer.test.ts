import assert from "node:assert/strict";
import test from "node:test";

import { buildTuiViewModel } from "../../../src/tui/view-model/tui-view-model.ts";
import type { TuiState } from "../../../src/tui/tui-types.ts";
import { renderTranscript } from "../../../src/tui/renderer-terminal/transcript-renderer.ts";

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

test("renderTranscript appends visible block lines without mouse-only affordances", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "Found changes",
          body: "Found changes in src/tui and tests.",
        },
      ],
    }),
  );

  const output = renderTranscript(view.transcript, { width: 80, height: 20 });
  assert.match(output.join("\n"), /Assistant/);
  assert.doesNotMatch(output.join("\n"), /\{open\}|wheelup|wheeldown/);
});
