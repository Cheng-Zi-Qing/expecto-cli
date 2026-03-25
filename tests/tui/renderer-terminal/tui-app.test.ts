import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createTerminalTuiApp } from "../../../src/tui/renderer-terminal/tui-app.ts";
import type { InteractiveTuiApp } from "../../../src/tui/tui-app.ts";
import type { TuiState } from "../../../src/tui/tui-types.ts";

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

test("createTerminalTuiApp starts, renders, updates, and closes terminal session", async () => {
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
  const handlers = {
    onDraftChange() {},
    onSubmit() {},
    onInterrupt() {},
    onToggleInspector() {},
    onFocusTimeline() {},
    onFocusComposer() {},
    onMoveSelectionUp() {},
    onMoveSelectionDown() {},
    onToggleSelectedItem() {},
    onExit() {},
  };

  const app = createTerminalTuiApp({
    initialState: state,
    handlers,
    terminal: {
      stdin,
      stdout,
    },
  });

  await app.start();
  assert.deepEqual(stdin.setRawModeCalls, [true]);
  assert.match(stdout.writes.join(""), /\u001b\[\?1049h/);
  assert.match(stdout.writes.join(""), /\u001b\[\?25l/);
  assert.match(stdout.writes.join(""), /assistant: inspect auth flow/);
  assert.match(stdout.writes.join(""), /Status: Done/);

  app.update({
    ...state,
    draft: "new prompt",
    timeline: [
      ...state.timeline,
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

  assert.match(stdout.writes.join(""), /assistant: second output/);
  assert.match(stdout.writes.join(""), /new prompt/);

  await app.close();
  assert.deepEqual(stdin.setRawModeCalls, [true, false]);
  assert.match(stdout.writes.join(""), /\u001b\[\?25h/);
  assert.match(stdout.writes.join(""), /\u001b\[\?1049l/);
});

test("createTerminalTuiApp maps keyboard input and keeps non-interrupt input disabled while locked", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  let app: InteractiveTuiApp;
  let state = createState();
  let interrupts = 0;
  let exits = 0;
  const submitted: string[] = [];

  const handlers = {
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
      state = {
        ...state,
        inspectorOpen: !state.inspectorOpen,
      };
      app.update(state);
    },
    onFocusTimeline() {},
    onFocusComposer() {},
    onMoveSelectionUp() {},
    onMoveSelectionDown() {},
    onToggleSelectedItem() {},
    onExit: () => {
      exits += 1;
    },
  };

  app = createTerminalTuiApp({
    initialState: state,
    handlers,
    terminal: {
      stdin,
      stdout,
    },
  });

  await app.start();

  stdin.emit("data", Buffer.from("ab"));
  assert.equal(state.draft, "ab");

  stdin.emit("data", Buffer.from("\u007f"));
  assert.equal(state.draft, "a");

  stdin.emit("data", Buffer.from("\u000a"));
  assert.equal(state.draft, "a\n");

  stdin.emit("data", Buffer.from("\u0009"));
  assert.equal(state.inspectorOpen, true);

  stdin.emit("data", Buffer.from("\u000d"));
  assert.deepEqual(submitted, ["a\n"]);
  assert.equal(state.draft, "");

  state = {
    ...state,
    inputLocked: true,
  };
  app.update(state);

  stdin.emit("data", Buffer.from("q"));
  stdin.emit("data", Buffer.from("\u0009"));
  stdin.emit("data", Buffer.from("\u007f"));
  stdin.emit("data", Buffer.from("\u000d"));
  stdin.emit("data", Buffer.from("\u000a"));
  assert.equal(state.draft, "");
  assert.deepEqual(submitted, ["a\n"]);

  stdin.emit("data", Buffer.from("\u0003"));
  stdin.emit("data", Buffer.from("\u0004"));
  assert.equal(interrupts, 1);
  assert.equal(exits, 1);

  await app.close();
});
