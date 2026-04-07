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
    projectLabel: "expecto-cli",
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

  assert.equal(state.activeThemeId, "hufflepuff");
  assert.equal(state.themePicker, null);
  assert.equal(state.focus, "composer");
  assert.equal(state.inspectorOpen, false);
  assert.equal(state.timelineMode, "scroll");
  assert.equal(state.timeline.length, 1);
  assert.equal(state.timeline[0]?.kind, "welcome");
  assert.match(state.timeline[0]?.summary ?? "", /expecto/i);
  assert.doesNotMatch(state.timeline[0]?.body ?? "", /\/inspect/);
});

test("createInitialTuiState opens the theme picker when no saved theme exists", () => {
  const state = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    savedThemeId: null,
    contextMetrics: {
      percent: 12,
      rules: 18,
      hooks: 2,
      docs: 6,
    },
  });

  assert.equal(state.activeThemeId, "hufflepuff");
  assert.deepEqual(state.themePicker, {
    reason: "first_launch",
    selectedThemeId: "hufflepuff",
    themeIds: ["hufflepuff", "gryffindor", "ravenclaw", "slytherin"],
  });
});

test("createInitialTuiState can force the first-launch picker for local testing", () => {
  const state = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    savedThemeId: "hufflepuff",
    forceThemePicker: true,
    contextMetrics: {
      percent: 12,
      rules: 18,
      hooks: 2,
      docs: 6,
    },
  });

  assert.equal(state.activeThemeId, "hufflepuff");
  assert.deepEqual(state.themePicker, {
    reason: "first_launch",
    selectedThemeId: "hufflepuff",
    themeIds: ["hufflepuff", "gryffindor", "ravenclaw", "slytherin"],
  });
});

test("reduceTuiState applies the selected theme and closes the picker", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    savedThemeId: null,
    contextMetrics: {
      percent: 12,
      rules: 18,
      hooks: 2,
      docs: 6,
    },
  });

  const applied = reduceTuiState(initial, {
    type: "toggle_selected_item",
  });

  assert.equal(applied.activeThemeId, "hufflepuff");
  assert.equal(applied.themePicker, null);
});

test("reduceTuiState moves theme picker selection on a 2x2 grid", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    savedThemeId: null,
    contextMetrics: {
      percent: 12,
      rules: 18,
      hooks: 2,
      docs: 6,
    },
  });

  const movedRight = reduceTuiState(initial, {
    type: "move_selection_right",
  });
  const movedDown = reduceTuiState(movedRight, {
    type: "move_selection_down",
  });
  const movedLeft = reduceTuiState(movedDown, {
    type: "move_selection_left",
  });
  const movedUp = reduceTuiState(movedLeft, {
    type: "move_selection_up",
  });

  assert.equal(movedRight.themePicker?.selectedThemeId, "gryffindor");
  assert.equal(movedDown.themePicker?.selectedThemeId, "slytherin");
  assert.equal(movedLeft.themePicker?.selectedThemeId, "ravenclaw");
  assert.equal(movedUp.themePicker?.selectedThemeId, "hufflepuff");
});

test("reduceTuiState toggles inspector, timeline mode, and switches focus modes", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
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
  const withSelectMode = reduceTuiState(withInspector, {
    type: "toggle_timeline_mode",
  });
  const timelineFocused = reduceTuiState(withInspector, {
    type: "focus_timeline",
  });
  const composerFocused = reduceTuiState(timelineFocused, {
    type: "focus_composer",
  });

  assert.equal(withInspector.inspectorOpen, true);
  assert.equal(withSelectMode.timelineMode, "select");
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
    projectLabel: "expecto-cli",
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
    projectLabel: "expecto-cli",
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

test("reduceTuiState opens the command theme picker with origin available as a fallback", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
    branchLabel: "main",
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    savedThemeId: "hufflepuff",
    contextMetrics: {
      percent: 12,
      rules: 18,
      hooks: 2,
      docs: 6,
    },
  });

  const opened = reduceTuiState(initial, {
    type: "open_theme_picker",
    reason: "command",
  });

  assert.deepEqual(opened.themePicker, {
    reason: "command",
    selectedThemeId: "hufflepuff",
    themeIds: ["hufflepuff", "gryffindor", "ravenclaw", "slytherin", "origin"],
  });
});

test("reduceTuiState derives slash suggestions from visible implemented commands in registry order", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
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

  const withSlashDraft = reduceTuiState(initial, {
    type: "set_draft",
    draft: "/",
  });

  assert.equal(withSlashDraft.commandMenu.visible, true);
  assert.deepEqual(
    withSlashDraft.commandMenu.items.map((item) => item.id),
    [
      "session.help",
      "session.status",
      "session.clear",
      "session.theme",
      "session.exit",
      "project.branch",
      "workspace.init",
    ],
  );
  assert.deepEqual(
    withSlashDraft.commandMenu.items.map((item) => item.name),
    ["/help", "/status", "/clear", "/theme", "/exit", "/branch", "/init"],
  );
});

test("reduceTuiState keeps prefix-only slash filtering and hides the menu once whitespace appears", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
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

  const withStatusPrefix = reduceTuiState(initial, {
    type: "set_draft",
    draft: "/st",
  });

  assert.equal(withStatusPrefix.commandMenu.visible, true);
  assert.deepEqual(
    withStatusPrefix.commandMenu.items.map((item) => item.name),
    ["/status"],
  );
  assert.doesNotMatch(
    withStatusPrefix.commandMenu.items.map((item) => item.name).join(" "),
    /\/inspect/,
  );

  const withWhitespace = reduceTuiState(withStatusPrefix, {
    type: "set_draft",
    draft: "/status details",
  });

  assert.equal(withWhitespace.commandMenu.visible, false);
  assert.deepEqual(withWhitespace.commandMenu.items, []);

  const withTrailingWhitespace = reduceTuiState(withStatusPrefix, {
    type: "set_draft",
    draft: "/status ",
  });

  assert.equal(withTrailingWhitespace.commandMenu.visible, false);
  assert.deepEqual(withTrailingWhitespace.commandMenu.items, []);

  const withLeadingWhitespace = reduceTuiState(withStatusPrefix, {
    type: "set_draft",
    draft: " /status",
  });

  assert.equal(withLeadingWhitespace.commandMenu.visible, false);
  assert.deepEqual(withLeadingWhitespace.commandMenu.items, []);

  const withSlashSpace = reduceTuiState(withStatusPrefix, {
    type: "set_draft",
    draft: "/ ",
  });

  assert.equal(withSlashSpace.commandMenu.visible, false);
  assert.deepEqual(withSlashSpace.commandMenu.items, []);
});

test("reduceTuiState moves the selected timeline item within bounds", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
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

test("reduceTuiState clears execution unread lines when a collapsed execution card is expanded", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
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

  const withRequest = reduceTuiState(initial, {
    type: "start_request_lifecycle",
    requestId: "request-1",
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });

  const withWaveDeclared = reduceTuiState(
    reduceTuiState(withRequest, {
      type: "project_interaction_event",
      event: {
        timestamp: "2026-03-26T10:00:00.050Z",
        sessionId: "session-1",
        turnId: "turn-1",
        requestId: "request-1",
        eventType: "assistant_response_started",
        payload: {
          responseId: "response-1",
        },
      },
    }),
    {
      type: "project_interaction_event",
      event: {
        timestamp: "2026-03-26T10:00:00.090Z",
        sessionId: "session-1",
        turnId: "turn-1",
        requestId: "request-1",
        eventType: "assistant_response_completed",
        payload: {
          responseId: "response-1",
          finishReason: "tool_calls",
          continuation: "awaiting_execution",
          plannedExecutionIds: ["exec-1"],
        },
      },
    },
  );

  const withExecutionStarted = reduceTuiState(withWaveDeclared, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T10:00:00.100Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-1",
      eventType: "execution_item_started",
      payload: {
        executionId: "exec-1",
        executionKind: "command",
        title: "Run command",
        origin: {
          source: "assistant",
        },
      },
    },
  });

  const withExecutionChunk = reduceTuiState(withExecutionStarted, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T10:00:00.200Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-1",
      eventType: "execution_item_chunk",
      payload: {
        executionId: "exec-1",
        stream: "stdout",
        output: "alpha\nbeta\n",
      },
    },
  });

  const executionCard = withExecutionChunk.timeline.find((item) => item.executionId === "exec-1");
  assert.equal(executionCard?.kind, "execution");
  assert.equal(executionCard?.collapsed, true);
  assert.equal(executionCard?.unreadLineCount, 2);

  const expanded = reduceTuiState(withExecutionChunk, {
    type: "toggle_selected_item",
  });

  const expandedExecutionCard = expanded.timeline.find((item) => item.executionId === "exec-1");
  assert.equal(expandedExecutionCard?.collapsed, false);
  assert.equal(expandedExecutionCard?.unreadLineCount, 0);
});

test("reduceTuiState gates prompt lifecycle projections but still projects builtin command execution events", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
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

  const withPromptRequest = reduceTuiState(initial, {
    type: "start_request_lifecycle",
    requestId: "request-turn-1",
    turnId: "turn-1",
    startedAt: "2026-03-26T10:00:00.000Z",
  });
  const withAssistantStarted = reduceTuiState(withPromptRequest, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T10:00:00.050Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "assistant_response_started",
      payload: {
        responseId: "response-1",
      },
    },
  });
  const withPromptTerminal = reduceTuiState(withAssistantStarted, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T10:00:00.090Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "request_completed",
      payload: {
        status: "completed",
      },
    },
  });

  const staleAssistantStream = reduceTuiState(withPromptTerminal, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T10:00:00.120Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "assistant_stream_chunk",
      payload: {
        responseId: "response-1",
        channel: "output_text",
        format: "markdown",
        delta: "stale",
      },
    },
  });
  const staleExecutionStarted = reduceTuiState(staleAssistantStream, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T10:00:00.130Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "execution_item_started",
      payload: {
        executionId: "exec-stale",
        executionKind: "command",
        title: "stale execution",
        origin: {
          source: "assistant",
        },
      },
    },
  });

  assert.equal(staleExecutionStarted.timeline.length, withPromptTerminal.timeline.length);
  assert.equal(staleExecutionStarted.timeline[0]?.kind, "assistant");
  assert.equal(staleExecutionStarted.timeline[0]?.body, "");

  const withPromptWave = reduceTuiState(
    reduceTuiState(
      reduceTuiState(initial, {
        type: "start_request_lifecycle",
        requestId: "request-turn-2",
        turnId: "turn-2",
        startedAt: "2026-03-26T10:10:00.000Z",
      }),
      {
        type: "project_interaction_event",
        event: {
          timestamp: "2026-03-26T10:10:00.010Z",
          sessionId: "session-1",
          turnId: "turn-2",
          requestId: "request-turn-2",
          eventType: "assistant_response_started",
          payload: {
            responseId: "response-2",
          },
        },
      },
    ),
    {
      type: "project_interaction_event",
      event: {
        timestamp: "2026-03-26T10:10:00.020Z",
        sessionId: "session-1",
        turnId: "turn-2",
        requestId: "request-turn-2",
        eventType: "assistant_response_completed",
        payload: {
          responseId: "response-2",
          finishReason: "tool_calls",
          continuation: "awaiting_execution",
          plannedExecutionIds: ["exec-declared"],
        },
      },
    },
  );
  const withUndeclaredExecution = reduceTuiState(withPromptWave, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T10:10:00.030Z",
      sessionId: "session-1",
      turnId: "turn-2",
      requestId: "request-turn-2",
      eventType: "execution_item_started",
      payload: {
        executionId: "exec-undeclared",
        executionKind: "command",
        title: "undeclared execution",
        origin: {
          source: "assistant",
        },
      },
    },
  });

  assert.equal(
    withUndeclaredExecution.timeline.some((item) => item.executionId === "exec-undeclared"),
    false,
  );

  const withBuiltinExecution = reduceTuiState(withPromptTerminal, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T10:30:00.000Z",
      sessionId: "session-1",
      turnId: "turn-command-1",
      requestId: "request-command-1",
      eventType: "execution_item_started",
      payload: {
        executionId: "execution-command-1",
        executionKind: "command",
        title: "Read git branch",
        origin: {
          source: "builtin_command",
        },
      },
    },
  });

  assert.equal(withBuiltinExecution.timeline.at(-1)?.kind, "execution");
  assert.equal(withBuiltinExecution.timeline.at(-1)?.summary, "Read git branch");
});

test("reduceTuiState marks interrupt intent on an active request and unlocks only on terminal completion", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
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

  const withRequest = reduceTuiState(initial, {
    type: "start_request_lifecycle",
    requestId: "request-turn-1",
    turnId: "turn-1",
    startedAt: "2026-03-26T11:00:00.000Z",
  });

  const withInterruptIntent = reduceTuiState(withRequest, {
    type: "mark_interrupt_intent",
  });

  assert.equal(withInterruptIntent.inputLocked, true);
  assert.equal(withInterruptIntent.activeRequestLedger?.interruptRequested, true);
  assert.equal(withInterruptIntent.activeRequestLedger?.phase, "interrupting");

  const withTerminalEvent = reduceTuiState(withInterruptIntent, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T11:00:00.200Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "request_completed",
      payload: {
        status: "interrupted",
      },
    },
  });

  assert.equal(withTerminalEvent.activeRequestLedger, null);
  assert.equal(withTerminalEvent.inputLocked, false);
});

test("reduceTuiState keeps assistant and execution cards request-scoped when ids repeat across requests", () => {
  const initial = createInitialTuiState({
    sessionId: "session-1",
    projectLabel: "expecto-cli",
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

  let assistantState = reduceTuiState(initial, {
    type: "start_request_lifecycle",
    requestId: "request-turn-1",
    turnId: "turn-1",
    startedAt: "2026-03-26T12:00:00.000Z",
  });
  assistantState = reduceTuiState(assistantState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:00:00.010Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "assistant_response_started",
      payload: {
        responseId: "response-1",
      },
    },
  });
  assistantState = reduceTuiState(assistantState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:00:00.020Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "assistant_stream_chunk",
      payload: {
        responseId: "response-1",
        channel: "output_text",
        format: "markdown",
        delta: "first response",
      },
    },
  });
  assistantState = reduceTuiState(assistantState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:00:00.040Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "request_completed",
      payload: {
        status: "completed",
      },
    },
  });
  assistantState = reduceTuiState(assistantState, {
    type: "start_request_lifecycle",
    requestId: "request-turn-2",
    turnId: "turn-2",
    startedAt: "2026-03-26T12:00:01.000Z",
  });
  assistantState = reduceTuiState(assistantState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:00:01.010Z",
      sessionId: "session-1",
      turnId: "turn-2",
      requestId: "request-turn-2",
      eventType: "assistant_response_started",
      payload: {
        responseId: "response-1",
      },
    },
  });
  assistantState = reduceTuiState(assistantState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:00:01.020Z",
      sessionId: "session-1",
      turnId: "turn-2",
      requestId: "request-turn-2",
      eventType: "assistant_stream_chunk",
      payload: {
        responseId: "response-1",
        channel: "output_text",
        format: "markdown",
        delta: "second response",
      },
    },
  });

  const assistantCards = assistantState.timeline.filter((item) => item.kind === "assistant");
  assert.equal(assistantCards.length, 2);
  assert.deepEqual(
    assistantCards.map((item) => ({
      requestId: item.requestId,
      responseId: item.responseId,
      body: item.body,
    })),
    [
      {
        requestId: "request-turn-1",
        responseId: "response-1",
        body: "first response",
      },
      {
        requestId: "request-turn-2",
        responseId: "response-1",
        body: "second response",
      },
    ],
  );

  let executionState = reduceTuiState(initial, {
    type: "start_request_lifecycle",
    requestId: "request-turn-1",
    turnId: "turn-1",
    startedAt: "2026-03-26T12:10:00.000Z",
  });
  executionState = reduceTuiState(executionState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:10:00.010Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "assistant_response_started",
      payload: {
        responseId: "response-1",
      },
    },
  });
  executionState = reduceTuiState(executionState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:10:00.020Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "assistant_response_completed",
      payload: {
        responseId: "response-1",
        finishReason: "tool_calls",
        continuation: "awaiting_execution",
        plannedExecutionIds: ["exec-1"],
      },
    },
  });
  executionState = reduceTuiState(executionState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:10:00.030Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "execution_item_started",
      payload: {
        executionId: "exec-1",
        executionKind: "command",
        title: "exec one",
        origin: {
          source: "assistant",
        },
      },
    },
  });
  executionState = reduceTuiState(executionState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:10:00.040Z",
      sessionId: "session-1",
      turnId: "turn-1",
      requestId: "request-turn-1",
      eventType: "request_completed",
      payload: {
        status: "completed",
      },
    },
  });
  executionState = reduceTuiState(executionState, {
    type: "start_request_lifecycle",
    requestId: "request-turn-2",
    turnId: "turn-2",
    startedAt: "2026-03-26T12:10:01.000Z",
  });
  executionState = reduceTuiState(executionState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:10:01.010Z",
      sessionId: "session-1",
      turnId: "turn-2",
      requestId: "request-turn-2",
      eventType: "assistant_response_started",
      payload: {
        responseId: "response-1",
      },
    },
  });
  executionState = reduceTuiState(executionState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:10:01.020Z",
      sessionId: "session-1",
      turnId: "turn-2",
      requestId: "request-turn-2",
      eventType: "assistant_response_completed",
      payload: {
        responseId: "response-1",
        finishReason: "tool_calls",
        continuation: "awaiting_execution",
        plannedExecutionIds: ["exec-1"],
      },
    },
  });
  executionState = reduceTuiState(executionState, {
    type: "project_interaction_event",
    event: {
      timestamp: "2026-03-26T12:10:01.030Z",
      sessionId: "session-1",
      turnId: "turn-2",
      requestId: "request-turn-2",
      eventType: "execution_item_started",
      payload: {
        executionId: "exec-1",
        executionKind: "command",
        title: "exec two",
        origin: {
          source: "assistant",
        },
      },
    },
  });

  const executionCards = executionState.timeline.filter((item) => item.kind === "execution");
  assert.equal(executionCards.length, 2);
  assert.deepEqual(
    executionCards.map((item) => ({
      requestId: item.requestId,
      executionId: item.executionId,
      summary: item.summary,
    })),
    [
      {
        requestId: "request-turn-1",
        executionId: "exec-1",
        summary: "exec one",
      },
      {
        requestId: "request-turn-2",
        executionId: "exec-1",
        summary: "exec two",
      },
    ],
  );
});
