import assert from "node:assert/strict";
import test from "node:test";

import { buildTuiViewModel } from "../../../src/tui/view-model/tui-view-model.ts";
import type { TuiState } from "../../../src/tui/tui-types.ts";
import {
  diffTranscriptLines,
  renderTranscript,
  renderTranscriptLines,
} from "../../../src/tui/renderer-terminal/transcript-renderer.ts";

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
    activeRequestLedger: overrides.activeRequestLedger ?? null,
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

test("renderTranscript preserves code indentation in visible lines", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "assistant-code-1",
          kind: "assistant",
          summary: "Code sample",
          body: ["```ts", "function f(x: number) {", "    return x;", "}", "```"].join("\n"),
        },
      ],
    }),
  );

  const output = renderTranscript(view.transcript, { width: 120, height: 20 });
  assert.match(output.join("\n"), / {4}return x;/);
});

test("renderTranscript keeps the selected card visible when the viewport is shorter than the transcript", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "First card",
          body: "first body",
        },
        {
          id: "assistant-2",
          kind: "assistant",
          summary: "Second card",
          body: "second body",
        },
        {
          id: "assistant-3",
          kind: "assistant",
          summary: "Third card",
          body: "third body",
        },
      ],
      selectedTimelineIndex: 0,
    }),
  );

  const output = renderTranscript(view.transcript, { width: 80, height: 3 });

  assert.match(output.join("\n"), /First card/);
  assert.doesNotMatch(output.join("\n"), /Third card/);
});

test("renderTranscriptLines returns the full transcript without viewport clipping", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "assistant-1",
          kind: "assistant",
          summary: "First card",
          body: "first body",
        },
        {
          id: "assistant-2",
          kind: "assistant",
          summary: "Second card",
          body: "second body",
        },
        {
          id: "assistant-3",
          kind: "assistant",
          summary: "Third card",
          body: "third body",
        },
      ],
    }),
  );

  const lines = renderTranscriptLines(view.transcript, 80);

  assert.match(lines.join("\n"), /First card/);
  assert.match(lines.join("\n"), /Third card/);
});

test("diffTranscriptLines reports append-only updates separately from replay-required updates", () => {
  assert.deepEqual(diffTranscriptLines(["a", "b"], ["a", "b", "c"]), {
    mode: "append",
    lines: ["c"],
  });
  assert.deepEqual(diffTranscriptLines(["a", "b"], ["a", "x"]), {
    mode: "replay",
    lines: ["a", "x"],
  });
});

test("renderTranscriptLines shows submitted input text only once for user cards", () => {
  const view = buildTuiViewModel(
    createSampleTuiState({
      timeline: [
        {
          id: "user-1",
          kind: "user",
          summary: "inspect auth flow",
          body: "inspect auth flow",
        },
      ],
    }),
  );

  const lines = renderTranscriptLines(view.transcript, 80);
  const output = lines.join("\n");

  assert.match(output, /Submitted Input/);
  assert.equal((output.match(/inspect auth flow/g) ?? []).length, 1);
});
