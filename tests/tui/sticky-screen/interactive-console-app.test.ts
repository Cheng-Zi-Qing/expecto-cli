import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { createInteractiveConsoleApp } from "../../../src/tui/sticky-screen/interactive-console-app.ts";
import type { ScreenWriter } from "../../../src/tui/sticky-screen/screen-writer.ts";
import type { TerminalSession } from "../../../src/tui/renderer-terminal/terminal-session.ts";
import type { InteractiveTuiApp, InteractiveTuiHandlers, TerminalTuiInput, TerminalTuiOutput } from "../../../src/tui/tui-app.ts";
import type { TuiState } from "../../../src/tui/tui-types.ts";

type FakeStdin = EventEmitter & TerminalTuiInput & {
  isTTY: boolean;
  setRawModeCalls: boolean[];
  pauseCalls: number;
};

type FakeStdout = EventEmitter & TerminalTuiOutput & {
  isTTY: boolean;
  columns: number;
  rows: number;
  writes: string[];
};

type FakeScreenWriter = ScreenWriter & {
  calls: string[];
  timelineChunks: string[];
  timelineReplacements: string[];
  fixedTimelineReplacements: string[];
};

type FakeTerminalSession = TerminalSession & {
  calls: string[];
};

function createFakeStdin(): FakeStdin {
  const emitter = new EventEmitter() as FakeStdin;
  emitter.isTTY = true;
  emitter.setRawModeCalls = [];
  emitter.pauseCalls = 0;
  emitter.setRawMode = (enabled: boolean) => {
    emitter.setRawModeCalls.push(enabled);
  };
  emitter.pause = () => {
    emitter.pauseCalls += 1;
  };
  return emitter;
}

function createFakeStdout(columns = 72, rows = 18): FakeStdout {
  const emitter = new EventEmitter() as FakeStdout;
  emitter.isTTY = true;
  emitter.columns = columns;
  emitter.rows = rows;
  emitter.writes = [];
  emitter.write = (chunk: string) => {
    emitter.writes.push(chunk);
  };
  return emitter;
}

function createFakeScreenWriter(): FakeScreenWriter {
  const calls: string[] = [];
  const timelineChunks: string[] = [];
  const timelineReplacements: string[] = [];
  const fixedTimelineReplacements: string[] = [];

  return {
    calls,
    timelineChunks,
    timelineReplacements,
    fixedTimelineReplacements,
    enterStickyMode: () => {
      calls.push("enter");
    },
    exitStickyMode: () => {
      calls.push("exit");
    },
    writeTimelineChunk: (text: string) => {
      calls.push(`timeline:${JSON.stringify(text)}`);
      timelineChunks.push(text);
    },
    replaceTimeline: (text: string) => {
      calls.push(`timeline:replace:${JSON.stringify(text)}`);
      timelineReplacements.push(text);
    },
    replaceFixedTimeline: (lines: string[], _previousLines?: string[]) => {
      calls.push(`timeline:replace-fixed:${JSON.stringify(lines)}`);
      fixedTimelineReplacements.push(lines.join("\n"));
    },
    setActiveStatus: (snapshot) => {
      calls.push(`status:${snapshot?.text ?? ""}`);
    },
    clearActiveStatus: () => {
      calls.push("status:clear");
    },
    renderComposer: (snapshot) => {
      calls.push(`composer:${JSON.stringify(snapshot.text)}`);
    },
    scheduleResize: () => {
      calls.push("resize");
    },
    suspendForPager: () => {
      calls.push("pager:suspend");
    },
    resumeFromPager: () => {
      calls.push("pager:resume");
    },
    fatalCleanup: () => {
      calls.push("fatal");
    },
  };
}

function createFakeTerminalSession(): FakeTerminalSession {
  const calls: string[] = [];

  return {
    calls,
    enter: () => {
      calls.push("enter");
    },
    exit: () => {
      calls.push("exit");
    },
  };
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
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
    draftAttachments: [],
    inputLocked: false,
    projectLabel: "expecto-cli",
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

function createHandlers(overrides: Partial<InteractiveTuiHandlers> = {}): InteractiveTuiHandlers {
  return {
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
    ...overrides,
  };
}

test("interactive console app appends transcript into scrollback and keeps composer redraw isolated", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  const screenWriter = createFakeScreenWriter();
  const terminalSession = createFakeTerminalSession();
  const initialState = createState({
    draft: "draft one",
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

  const app = createInteractiveConsoleApp(
    {
      initialState,
      handlers: createHandlers(),
      terminal: { stdin, stdout },
    },
    {
      screenWriter,
      terminalSession,
    },
  );

  await app.start();

  assert.deepEqual(terminalSession.calls, ["enter"]);
  assert.ok(
    screenWriter.calls.includes("enter"),
    "expected sticky mode to be entered after priming the initial footer snapshot",
  );
  assert.ok(
    screenWriter.calls.includes("status:clear"),
    "expected an idle state to clear the transient active status",
  );
  assert.ok(
    screenWriter.calls.includes("composer:\"draft one\""),
    "expected the composer redraw to be isolated from timeline writes",
  );
  assert.match(screenWriter.timelineChunks.join(""), /assistant: inspect auth flow/);

  screenWriter.calls.length = 0;

  app.update(createState({
    draft: "draft two",
    runtimeState: "streaming",
    timeline: [
      {
        id: "assistant-1",
        kind: "assistant",
        summary: "assistant: inspect auth flow",
        body: "assistant: inspect auth flow",
        collapsed: false,
      },
      {
        id: "assistant-2",
        kind: "assistant",
        summary: "assistant: second output",
        body: "assistant: second output",
        collapsed: false,
      },
    ],
    selectedTimelineIndex: 1,
  }));

  assert.match(screenWriter.timelineChunks.at(-1) ?? "", /assistant: second output/);
  assert.doesNotMatch(screenWriter.timelineChunks.at(-1) ?? "", /inspect auth flow/);
  assert.ok(
    screenWriter.calls.includes("status:Thinking..."),
    "expected active status redraw to stay separate from timeline writes",
  );
  assert.ok(
    screenWriter.calls.includes("composer:\"draft two\""),
    "expected composer redraw to stay separate from timeline writes",
  );

  await app.close();
  assert.deepEqual(terminalSession.calls, ["enter", "exit"]);
});

test("interactive console app never routes legacy timeline focus or selection keys", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  const screenWriter = createFakeScreenWriter();
  const terminalSession = createFakeTerminalSession();
  let app: InteractiveTuiApp;
  let state = createState();
  let focusTimelineCalls = 0;
  let focusComposerCalls = 0;
  let toggleInspectorCalls = 0;
  let moveUpCalls = 0;
  let moveDownCalls = 0;

  app = createInteractiveConsoleApp(
    {
      initialState: state,
      handlers: createHandlers({
        onDraftChange: (draft) => {
          state = {
            ...state,
            draft,
          };
          app.update(state);
        },
        onFocusTimeline: () => {
          focusTimelineCalls += 1;
        },
        onFocusComposer: () => {
          focusComposerCalls += 1;
        },
        onToggleInspector: () => {
          toggleInspectorCalls += 1;
        },
        onMoveSelectionUp: () => {
          moveUpCalls += 1;
        },
        onMoveSelectionDown: () => {
          moveDownCalls += 1;
        },
      }),
      terminal: { stdin, stdout },
    },
    {
      screenWriter,
      terminalSession,
    },
  );

  await app.start();

  stdin.emit("data", Buffer.from("\t"));
  stdin.emit("data", Buffer.from("oi"));
  stdin.emit("data", Buffer.from("\u001b[A"));
  stdin.emit("data", Buffer.from("\u001b[B"));
  stdin.emit("data", Buffer.from("\u001b[5~"));
  stdin.emit("data", Buffer.from("\u001b[6~"));

  assert.equal(state.draft, "oi");
  assert.equal(focusTimelineCalls, 0);
  assert.equal(focusComposerCalls, 0);
  assert.equal(toggleInspectorCalls, 0);
  assert.equal(moveUpCalls, 0);
  assert.equal(moveDownCalls, 0);

  await app.close();
});

test("interactive console app submits prompts when enter arrives as a bare LF chunk", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  const screenWriter = createFakeScreenWriter();
  const terminalSession = createFakeTerminalSession();
  let app: InteractiveTuiApp;
  let state = createState();
  const submitted: string[] = [];

  app = createInteractiveConsoleApp(
    {
      initialState: state,
      handlers: createHandlers({
        onDraftChange: (draft) => {
          state = {
            ...state,
            draft,
          };
          app.update(state);
        },
        onSubmit: (prompt) => {
          submitted.push(prompt);
          state = {
            ...state,
            draft: "",
          };
          app.update(state);
        },
      }),
      terminal: { stdin, stdout },
    },
    {
      screenWriter,
      terminalSession,
    },
  );

  await app.start();

  stdin.emit("data", Buffer.from("/branch"));
  stdin.emit("data", Buffer.from("\n"));

  assert.deepEqual(submitted, ["/branch"]);
  assert.equal(state.draft, "");

  await app.close();
});

test("interactive console app preserves bare LF newline after a CR-style enter has been observed", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  const screenWriter = createFakeScreenWriter();
  const terminalSession = createFakeTerminalSession();
  let app: InteractiveTuiApp;
  let state = createState();
  const submitted: string[] = [];

  app = createInteractiveConsoleApp(
    {
      initialState: state,
      handlers: createHandlers({
        onDraftChange: (draft) => {
          state = {
            ...state,
            draft,
          };
          app.update(state);
        },
        onSubmit: (prompt) => {
          submitted.push(prompt);
          state = {
            ...state,
            draft: "",
          };
          app.update(state);
        },
      }),
      terminal: { stdin, stdout },
    },
    {
      screenWriter,
      terminalSession,
    },
  );

  await app.start();

  stdin.emit("data", Buffer.from("hello"));
  stdin.emit("data", Buffer.from("\r"));
  stdin.emit("data", Buffer.from("line one"));
  stdin.emit("data", Buffer.from("\n"));

  assert.deepEqual(submitted, ["hello"]);
  assert.equal(state.draft, "line one\n");

  await app.close();
});

test("interactive console app intercepts /inspect locally without submitting it", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  const screenWriter = createFakeScreenWriter();
  const terminalSession = createFakeTerminalSession();
  let app: InteractiveTuiApp;
  let state = createState();
  const submitted: string[] = [];
  const inspected: string[] = [];

  app = createInteractiveConsoleApp(
    {
      initialState: state,
      handlers: createHandlers({
        onDraftChange: (draft) => {
          state = {
            ...state,
            draft,
          };
          app.update(state);
        },
        onSubmit: (prompt) => {
          submitted.push(prompt);
        },
        onInspectExecution: (executionId) => {
          inspected.push(executionId);
          state = {
            ...state,
            draft: "",
          };
          app.update(state);
        },
      }),
      terminal: { stdin, stdout },
    },
    {
      screenWriter,
      terminalSession,
    },
  );

  await app.start();

  stdin.emit("data", Buffer.from("/inspect e7a9\r"));

  assert.deepEqual(inspected, ["e7a9"]);
  assert.deepEqual(submitted, []);
  assert.equal(state.draft, "");

  await app.close();
});

test("interactive console app routes picker navigation keys locally while theme selection is active", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  const screenWriter = createFakeScreenWriter();
  const terminalSession = createFakeTerminalSession();
  let app: InteractiveTuiApp;
  let state = createState({
    timeline: [
      {
        id: "welcome",
        kind: "welcome",
        summary: "expecto is ready",
        body: "Enter send",
        collapsed: false,
      },
    ],
    themePicker: {
      reason: "first_launch",
      selectedThemeId: "hufflepuff",
      themeIds: ["hufflepuff", "gryffindor", "ravenclaw", "slytherin"],
    },
  });
  let draftChanges = 0;
  let moveUpCalls = 0;
  let moveDownCalls = 0;
  let applyCalls = 0;
  let submitCalls = 0;

  app = createInteractiveConsoleApp(
    {
      initialState: state,
      handlers: createHandlers({
        onDraftChange: (draft) => {
          draftChanges += 1;
          state = {
            ...state,
            draft,
          };
          app.update(state);
        },
        onSubmit: () => {
          submitCalls += 1;
        },
        onMoveSelectionUp: () => {
          moveUpCalls += 1;
        },
        onMoveSelectionDown: () => {
          moveDownCalls += 1;
        },
        onToggleSelectedItem: () => {
          applyCalls += 1;
        },
      }),
      terminal: { stdin, stdout },
    },
    {
      screenWriter,
      terminalSession,
    },
  );

  await app.start();

  const initialOverlayOutput = [
    ...screenWriter.timelineChunks,
    ...screenWriter.timelineReplacements,
    ...screenWriter.fixedTimelineReplacements,
  ].join("");

  assert.match(initialOverlayOutput, /Hufflepuff/);
  assert.match(initialOverlayOutput, /Gryffindor/);
  assert.match(initialOverlayOutput, /Welcome back!/);

  stdin.emit("data", Buffer.from("x"));
  stdin.emit("data", Buffer.from("\u001b[A"));
  stdin.emit("data", Buffer.from("\u001b[B"));
  stdin.emit("data", Buffer.from("\r"));

  assert.equal(state.draft, "");
  assert.equal(draftChanges, 0);
  assert.equal(submitCalls, 0);
  assert.equal(moveUpCalls, 1);
  assert.equal(moveDownCalls, 1);
  assert.equal(applyCalls, 1);

  app.update(createState({
    timeline: state.timeline,
    themePicker: {
      reason: "first_launch",
      selectedThemeId: "gryffindor",
      themeIds: ["hufflepuff", "gryffindor", "ravenclaw", "slytherin"],
    },
  }));

  assert.match(screenWriter.fixedTimelineReplacements.at(-1) ?? "", /Gryffindor/);
  assert.match(screenWriter.fixedTimelineReplacements.at(-1) ?? "", /Gryffindor Lion is standing by/);

  await app.close();
});

test("interactive console app restores the prior transcript after closing the theme picker", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  const screenWriter = createFakeScreenWriter();
  const terminalSession = createFakeTerminalSession();
  const timeline = [
    {
      id: "user-1",
      kind: "user" as const,
      summary: "hello",
      body: "hello",
      collapsed: false,
    },
    {
      id: "assistant-1",
      kind: "assistant" as const,
      summary: "assistant: hi",
      body: "assistant: hi",
      collapsed: false,
    },
  ];

  const app = createInteractiveConsoleApp(
    {
      initialState: createState({
        timeline,
      }),
      handlers: createHandlers(),
      terminal: { stdin, stdout },
    },
    {
      screenWriter,
      terminalSession,
    },
  );

  await app.start();

  const initialTimelineOutput = screenWriter.timelineChunks.join("");
  assert.match(initialTimelineOutput, /hello/);
  assert.match(initialTimelineOutput, /assistant: hi/);

  app.update(createState({
    timeline,
    themePicker: {
      reason: "command",
      selectedThemeId: "hufflepuff",
      themeIds: ["hufflepuff", "gryffindor", "ravenclaw", "slytherin"],
    },
  }));

  assert.match(screenWriter.fixedTimelineReplacements.at(-1) ?? "", /Hufflepuff/);

  app.update(createState({
    timeline,
    themePicker: null,
  }));

  assert.match(screenWriter.timelineReplacements.at(-1) ?? "", /hello/);
  assert.match(screenWriter.timelineReplacements.at(-1) ?? "", /assistant: hi/);

  await app.close();
});

test("interactive console app keeps the theme picker as a single overlay without a separate footer frame", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  const terminalSession = createFakeTerminalSession();

  const app = createInteractiveConsoleApp(
    {
      initialState: createState({
        themePicker: {
          reason: "first_launch",
          selectedThemeId: "hufflepuff",
          themeIds: ["hufflepuff", "gryffindor", "ravenclaw", "slytherin"],
        },
      }),
      handlers: createHandlers(),
      terminal: { stdin, stdout },
    },
    {
      terminalSession,
    },
  );

  await app.start();

  const output = stripAnsi(stdout.writes.join(""));

  assert.match(output, /Sorting Hat/);
  assert.match(output, /House Selection/);
  assert.doesNotMatch(output, /╭ Composer/);
  assert.doesNotMatch(output, /Theme Picker/);

  await app.close();
});

test("interactive console app replaces the theme picker overlay without a trailing newline scroll tick", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  const screenWriter = createFakeScreenWriter();
  const terminalSession = createFakeTerminalSession();

  const app = createInteractiveConsoleApp(
    {
      initialState: createState({
        themePicker: {
          reason: "first_launch",
          selectedThemeId: "hufflepuff",
          themeIds: ["hufflepuff", "gryffindor", "ravenclaw", "slytherin"],
        },
      }),
      handlers: createHandlers(),
      terminal: { stdin, stdout },
    },
    {
      screenWriter,
      terminalSession,
    },
  );

  await app.start();

  assert.ok(
    !(screenWriter.fixedTimelineReplacements.at(-1) ?? "").endsWith("\n"),
    "expected overlay repaint payloads to avoid a trailing newline that would scroll the sticky region",
  );

  app.update(createState({
    themePicker: {
      reason: "first_launch",
      selectedThemeId: "slytherin",
      themeIds: ["hufflepuff", "gryffindor", "ravenclaw", "slytherin"],
    },
  }));

  assert.ok(
    !(screenWriter.fixedTimelineReplacements.at(-1) ?? "").endsWith("\n"),
    "expected subsequent overlay replacements to avoid trailing newline scroll ticks",
  );

  await app.close();
});

test("interactive console app pauses stdin on close so the process can return to the shell", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  const screenWriter = createFakeScreenWriter();
  const terminalSession = createFakeTerminalSession();

  const app = createInteractiveConsoleApp(
    {
      initialState: createState(),
      handlers: createHandlers(),
      terminal: { stdin, stdout },
    },
    {
      screenWriter,
      terminalSession,
    },
  );

  await app.start();
  await app.close();

  assert.equal(stdin.pauseCalls, 1);
});

test("interactive console app keeps pending assistant placeholders out of scrollback and appends final output", async () => {
  const stdin = createFakeStdin();
  const stdout = createFakeStdout();
  const screenWriter = createFakeScreenWriter();
  const terminalSession = createFakeTerminalSession();
  const initialState = createState({
    timeline: [
      {
        id: "user-1",
        kind: "user",
        summary: "Reply with the exact text OK and nothing else.",
        body: "Reply with the exact text OK and nothing else.",
        collapsed: false,
      },
    ],
  });

  const app = createInteractiveConsoleApp(
    {
      initialState,
      handlers: createHandlers(),
      terminal: { stdin, stdout },
    },
    {
      screenWriter,
      terminalSession,
    },
  );

  await app.start();
  screenWriter.timelineChunks.length = 0;

  app.update(createState({
    runtimeState: "streaming",
    timeline: [
      ...initialState.timeline,
      {
        id: "assistant-1",
        kind: "assistant",
        summary: "Thinking...",
        body: "",
        collapsed: false,
        requestId: "request-turn-1",
        responseId: "response-turn-1",
      },
    ],
  }));

  assert.equal(screenWriter.timelineChunks.length, 0);

  app.update(createState({
    runtimeState: "ready",
    timeline: [
      ...initialState.timeline,
      {
        id: "assistant-1",
        kind: "assistant",
        summary: "OK",
        body: "OK",
        collapsed: false,
        requestId: "request-turn-1",
        responseId: "response-turn-1",
      },
    ],
  }));

  const latestChunk = screenWriter.timelineChunks.at(-1) ?? "";

  assert.match(latestChunk, /Revelio/);
  assert.match(latestChunk, /OK/);
  assert.doesNotMatch(latestChunk, /Reply with the exact text OK and nothing else\./);
  assert.doesNotMatch(latestChunk, /Thinking/);

  await app.close();
});
