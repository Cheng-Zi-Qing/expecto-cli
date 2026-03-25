import test from "node:test";
import assert from "node:assert/strict";

import {
  createInitialTuiState,
  reduceTuiState,
} from "../../src/tui/tui-state.ts";
import { deriveContextMetrics } from "../../src/tui/context-metrics.ts";

test("createInitialTuiState starts with a welcome card and composer focus", () => {
  const state = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "beta-agent",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    contextMetrics: {
      percent: 12,
      rules: 18,
      hooks: 2,
      docs: 6,
    },
  });

  assert.equal(state.focus, "composer");
  assert.equal(state.inspectorOpen, false);
  assert.equal(state.timeline.length, 1);
  assert.equal(state.timeline[0]?.kind, "welcome");
  assert.match(state.timeline[0]?.summary ?? "", /beta/i);
});

test("reduceTuiState toggles inspector and switches focus modes", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "beta-agent",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    contextMetrics: {
      percent: 0,
      rules: 18,
      hooks: 2,
      docs: 6,
    },
  });

  const withInspector = reduceTuiState(initial, {
    type: "toggle_inspector",
  });
  const timelineFocused = reduceTuiState(withInspector, {
    type: "focus_timeline",
  });
  const composerFocused = reduceTuiState(timelineFocused, {
    type: "focus_composer",
  });

  assert.equal(withInspector.inspectorOpen, true);
  assert.equal(timelineFocused.focus, "timeline");
  assert.equal(composerFocused.focus, "composer");
});

test("deriveContextMetrics approximates context usage and reports visible counters", () => {
  const metrics = deriveContextMetrics({
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    instructions: [
      "Follow AGENTS.md",
      "Prefer rg",
      "Use markdown-driven planning",
    ],
    hooksCount: 2,
    loadedDocsCount: 6,
    sessionSummary: "Task history and summaries are loaded.",
    conversation: [
      "user: inspect the auth layer",
      "assistant: reading files and tracing the issue",
    ],
  });

  assert.equal(metrics.rules, 3);
  assert.equal(metrics.hooks, 2);
  assert.equal(metrics.docs, 6);
  assert.ok(metrics.percent > 0);
  assert.ok(metrics.percent < 100);
});

test("reduceTuiState replaces the welcome card with real timeline items", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "beta-agent",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    contextMetrics: {
      percent: 12,
      rules: 18,
      hooks: 2,
      docs: 6,
    },
  });

  const withUser = reduceTuiState(initial, {
    type: "append_user_message",
    prompt: "inspect auth flow",
  });
  const withAssistant = reduceTuiState(withUser, {
    type: "append_assistant_message",
    output: "I am reading the auth files now.",
  });

  assert.deepEqual(
    withAssistant.timeline.map((item) => item.kind),
    ["user", "assistant"],
  );
  assert.equal(withAssistant.selectedTimelineIndex, 1);
});

test("reduceTuiState toggles the selected execution card", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "beta-agent",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    contextMetrics: {
      percent: 12,
      rules: 18,
      hooks: 2,
      docs: 6,
    },
  });
  const withExecution = reduceTuiState(initial, {
    type: "append_execution_item",
    summary: "Running tool",
    body: "rg --files src",
  });
  const toggled = reduceTuiState(withExecution, {
    type: "toggle_selected_item",
  });

  assert.equal(withExecution.timeline[0]?.collapsed, true);
  assert.equal(toggled.timeline[0]?.collapsed, false);
});

test("reduceTuiState moves the selected timeline item within bounds", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "beta-agent",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    contextMetrics: {
      percent: 12,
      rules: 18,
      hooks: 2,
      docs: 6,
    },
  });
  const withItems = reduceTuiState(
    reduceTuiState(
      reduceTuiState(initial, {
        type: "append_user_message",
        prompt: "inspect auth flow",
      }),
      {
        type: "append_assistant_message",
        output: "reading auth files",
      },
    ),
    {
      type: "append_system_message",
      line: "conversation cleared",
    },
  );
  const movedUp = reduceTuiState(withItems, {
    type: "move_selection_up",
  });
  const movedUpAgain = reduceTuiState(movedUp, {
    type: "move_selection_up",
  });
  const movedDown = reduceTuiState(movedUpAgain, {
    type: "move_selection_down",
  });
  const movedDownPastEnd = reduceTuiState(
    reduceTuiState(movedDown, {
      type: "move_selection_down",
    }),
    {
      type: "move_selection_down",
    },
  );

  assert.equal(withItems.selectedTimelineIndex, 2);
  assert.equal(movedUp.selectedTimelineIndex, 1);
  assert.equal(movedUpAgain.selectedTimelineIndex, 0);
  assert.equal(movedDown.selectedTimelineIndex, 1);
  assert.equal(movedDownPastEnd.selectedTimelineIndex, 2);
});
