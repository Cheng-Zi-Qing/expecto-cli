import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createTerminalTuiApp } from "../../../src/tui/renderer-terminal/tui-app.ts";
import type { InteractiveTuiApp } from "../../../src/tui/tui-app.ts";
import type { TuiState } from "../../../src/tui/tui-types.ts";

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

type FakeStdin = EventEmitter & {
  isTTY: boolean;
  setRawModeCalls: boolean[];
  setRawMode: (enabled: boolean) => void;
};

type FakeStdout = EventEmitter & {
  isTTY: boolean;
  columns: number;
  rows: number;
  writes: string[];
  write: (chunk: string) => void;
};

function createFakeStdin(): FakeStdin {
  const emitter = new EventEmitter() as FakeStdin;
  emitter.isTTY = true;
  emitter.setRawModeCalls = [];
  emitter.setRawMode = (enabled) => {
    emitter.setRawModeCalls.push(enabled);
  };
  return emitter;
}

function createFakeStdout(columns = 60, rows = 10): FakeStdout {
  const emitter = new EventEmitter() as FakeStdout;
  emitter.isTTY = true;
  emitter.columns = columns;
  emitter.rows = rows;
  emitter.writes = [];
  emitter.write = (chunk) => {
    emitter.writes.push(chunk);
  };
  return emitter;
}

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

test("createTerminalTuiApp keeps sticky main-screen chrome with rail-only assistant output and framed footer", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout(54, 12);
  const state = createState({
    timeline: [
      {
        id: "assistant-1",
        kind: "assistant",
        summary: "assistant: inspect auth flow",
        body: "assistant: inspect auth flow",
        collapsed: false,
      },
    ],
  });

  const app = createTerminalTuiApp({
    initialState: state,
    handlers: {
      onDraftChange() {},
      onSubmit() {},
      onInterrupt() {},
      onToggleInspector() {},
      onToggleTimelineMode() {},
      onFocusTimeline() {},
      onFocusComposer() {},
      onMoveSelectionUp() {},
      onMoveSelectionDown() {},
      onToggleSelectedItem() {},
      onInspectExecution() {},
      onExit() {},
    },
    terminal: {
      stdin,
      stdout,
    },
  });

  await app.start();

  const output = stdout.writes.join("");
  const plainOutput = stripAnsi(output);
  assert.match(plainOutput, /│ assistant: inspect auth flow/);
  assert.doesNotMatch(plainOutput, /╭ Assistant:/);
  assert.doesNotMatch(plainOutput, /assistant: inspect auth flow.* │/);
  assert.match(plainOutput, /╭ Composer/);
  assert.match(plainOutput, /╰ Status:/);

  await app.close();
});

test("createTerminalTuiApp ignores legacy timeline controls and keeps locked input inert except interrupt and exit", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  let app: InteractiveTuiApp;
  let state = createState();
  let interrupts = 0;
  let exits = 0;
  let focusTimelineCalls = 0;
  let toggleInspectorCalls = 0;
  const submitted: string[] = [];

  app = createTerminalTuiApp({
    initialState: state,
    handlers: {
      onDraftChange: (draft: string) => {
        state = {
          ...state,
          draft,
        };
        app.update(state);
      },
      onSubmit: (prompt: string) => {
        submitted.push(prompt);
        state = {
          ...state,
          draft: "",
        };
        app.update(state);
      },
      onInterrupt: () => {
        interrupts += 1;
      },
      onToggleInspector: () => {
        toggleInspectorCalls += 1;
      },
      onToggleTimelineMode() {},
      onFocusTimeline: () => {
        focusTimelineCalls += 1;
      },
      onFocusComposer() {},
      onMoveSelectionUp() {},
      onMoveSelectionDown() {},
      onToggleSelectedItem() {},
      onInspectExecution() {},
      onExit: () => {
        exits += 1;
      },
    },
    terminal: {
      stdin,
      stdout,
    },
  });

  await app.start();

  stdin.emit("data", Buffer.from("\t"));
  stdin.emit("data", Buffer.from("oi"));
  stdin.emit("data", Buffer.from("\u001b[A"));
  stdin.emit("data", Buffer.from("\u001b[B"));
  stdin.emit("data", Buffer.from("\u001b[5~"));
  stdin.emit("data", Buffer.from("\u001b[6~"));
  stdin.emit("data", Buffer.from("\u000d"));

  assert.equal(state.draft, "");
  assert.deepEqual(submitted, ["oi"]);
  assert.equal(focusTimelineCalls, 0);
  assert.equal(toggleInspectorCalls, 0);

  state = {
    ...state,
    inputLocked: true,
  };
  app.update(state);

  stdin.emit("data", Buffer.from("q"));
  stdin.emit("data", Buffer.from("\u000d"));
  stdin.emit("data", Buffer.from("\u0003"));
  stdin.emit("data", Buffer.from("\u0004"));

  assert.equal(state.draft, "");
  assert.deepEqual(submitted, ["oi"]);
  assert.equal(interrupts, 1);
  assert.equal(exits, 1);

  await app.close();
});

test("createTerminalTuiApp appends new transcript lines without replaying prior history", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout(54, 12);
  const initialTimeline = [
    {
      id: "assistant-1",
      kind: "assistant" as const,
      summary: "assistant: inspect auth flow",
      body: "assistant: inspect auth flow",
      collapsed: false,
    },
  ];
  let state = createState({
    draft: "new prompt",
    timeline: initialTimeline,
  });

  const app = createTerminalTuiApp({
    initialState: state,
    handlers: {
      onDraftChange: (draft: string) => {
        state = {
          ...state,
          draft,
        };
      },
      onSubmit() {},
      onInterrupt() {},
      onToggleInspector() {},
      onToggleTimelineMode() {},
      onFocusTimeline() {},
      onFocusComposer() {},
      onMoveSelectionUp() {},
      onMoveSelectionDown() {},
      onToggleSelectedItem() {},
      onInspectExecution() {},
      onExit() {},
    },
    terminal: {
      stdin,
      stdout,
    },
  });

  await app.start();
  stdout.writes.length = 0;

  state = createState({
    draft: "new prompt",
    timeline: [
      ...initialTimeline,
      {
        id: "assistant-2",
        kind: "assistant",
        summary: "assistant: second output",
        body: "assistant: second output",
        collapsed: false,
      },
    ],
    selectedTimelineIndex: 1,
  });

  app.update(state);

  const output = stdout.writes.join("");
  assert.match(output, /assistant: second output/);
  assert.doesNotMatch(output, /assistant: inspect auth flow/);

  await app.close();
});

test("createTerminalTuiApp replays the current transcript when welcome content is replaced by the first real timeline items", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout(54, 12);
  const initialState = createState({
    timeline: [
      {
        id: "welcome",
        kind: "welcome",
        summary: "beta is ready",
        body: "Enter send",
        collapsed: false,
      },
    ],
  });

  const app = createTerminalTuiApp({
    initialState,
    handlers: {
      onDraftChange() {},
      onSubmit() {},
      onInterrupt() {},
      onToggleInspector() {},
      onToggleTimelineMode() {},
      onFocusTimeline() {},
      onFocusComposer() {},
      onMoveSelectionUp() {},
      onMoveSelectionDown() {},
      onToggleSelectedItem() {},
      onInspectExecution() {},
      onExit() {},
    },
    terminal: {
      stdin,
      stdout,
    },
  });

  await app.start();
  stdout.writes.length = 0;

  app.update(createState({
    timeline: [
      {
        id: "system-1",
        kind: "system",
        summary: "branch: main",
        body: "branch: main",
        collapsed: false,
      },
      {
        id: "execution-1",
        kind: "execution",
        summary: "Read git branch",
        body: "$ git rev-parse --abbrev-ref HEAD\nmain",
        collapsed: false,
      },
    ],
    selectedTimelineIndex: 1,
  }));

  const output = stdout.writes.join("");
  assert.match(output, /branch: main/);
  assert.match(output, /Read git branch/);

  await app.close();
});

test("createTerminalTuiApp exits on a second idle Ctrl+C", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  let exits = 0;

  const app = createTerminalTuiApp({
    initialState: createState(),
    handlers: {
      onDraftChange() {},
      onSubmit() {},
      onInterrupt() {},
      onToggleInspector() {},
      onToggleTimelineMode() {},
      onFocusTimeline() {},
      onFocusComposer() {},
      onMoveSelectionUp() {},
      onMoveSelectionDown() {},
      onToggleSelectedItem() {},
      onInspectExecution() {},
      onExit: () => {
        exits += 1;
      },
    },
    terminal: {
      stdin,
      stdout,
    },
  });

  await app.start();

  stdin.emit("data", Buffer.from("\u0003"));
  assert.equal(exits, 0);

  stdin.emit("data", Buffer.from("\u0003"));
  assert.equal(exits, 1);

  await app.close();
});
