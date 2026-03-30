import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { currentAppPath } from "../../src/core/brand.ts";
import { buildBootstrapContext } from "../../src/runtime/bootstrap-context.ts";
import type { RenderedTimelineLayout } from "../../src/tui/renderer-blessed/block-layout.ts";
import { renderTimelineItems } from "../../src/tui/renderer-blessed/block-renderer.ts";
import { createRendererPalette } from "../../src/tui/renderer-blessed/tui-theme.ts";
import { runInteractiveTui } from "../../src/tui/run-interactive-tui.ts";
import type { InteractiveTuiApp, InteractiveTuiAppFactoryInput, TerminalTuiIo } from "../../src/tui/tui-app.ts";
import type { TuiState } from "../../src/tui/tui-types.ts";
import type { UserConfig, UserConfigStore } from "../../src/cli/user-config.ts";

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "expecto-tui-"));
  await mkdir(join(root, currentAppPath("docs")), { recursive: true });
  await writeFile(join(root, currentAppPath("docs", "00-requirements.md")), "# Requirements\n");
  await writeFile(join(root, currentAppPath("docs", "01-plan.md")), "# Plan\n");
  return root;
}

async function waitFor(check: () => boolean, message: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (check()) {
      return;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }

  assert.fail(message);
}

class FakeInteractiveTuiApp implements InteractiveTuiApp {
  readonly states: TuiState[] = [];
  readonly renderedTimelineContent: string[] = [];
  // TDD: start capturing full renderer layout so tests can assert which line is selected.
  readonly renderedTimelineLayouts: RenderedTimelineLayout[] = [];
  private readonly handlers: InteractiveTuiAppFactoryInput["handlers"];
  closed = false;
  pagerSuspended = 0;
  pagerResumed = 0;

  constructor(input: InteractiveTuiAppFactoryInput) {
    this.handlers = input.handlers;
    this.states.push(input.initialState);
    const layout = renderTimelineLayout(input.initialState);
    this.renderedTimelineLayouts.push(layout);
    this.renderedTimelineContent.push(layout.content);
  }

  update(state: TuiState): void {
    this.states.push(state);
    const layout = renderTimelineLayout(state);
    this.renderedTimelineLayouts.push(layout);
    this.renderedTimelineContent.push(layout.content);
  }

  async start(): Promise<void> {}

  async close(): Promise<void> {
    this.closed = true;
  }

  async suspendForPager(): Promise<void> {
    this.pagerSuspended += 1;
  }

  async resumeFromPager(): Promise<void> {
    this.pagerResumed += 1;
  }

  submit(prompt: string): void {
    this.handlers.onSubmit(prompt);
  }

  setDraft(draft: string): void {
    this.handlers.onDraftChange(draft);
  }

  toggleInspector(): void {
    this.handlers.onToggleInspector();
  }

  toggleTimelineMode(): void {
    this.handlers.onToggleTimelineMode();
  }

  moveSelectionUp(): void {
    this.handlers.onMoveSelectionUp();
  }

  moveSelectionDown(): void {
    this.handlers.onMoveSelectionDown();
  }

  interrupt(): void {
    this.handlers.onInterrupt();
  }

  toggleSelectedItem(): void {
    this.handlers.onToggleSelectedItem();
  }

  exit(): void {
    this.handlers.onExit();
  }

  inspectExecution(executionId: string): void {
    this.handlers.onInspectExecution?.(executionId);
  }

  latestState(): TuiState {
    const state = this.states.at(-1);

    assert.ok(state, "expected renderer state to exist");
    return state;
  }
}

function renderTimelineLayout(state: TuiState): RenderedTimelineLayout {
  const palette = createRendererPalette({
    focus: state.focus,
    inputLocked: state.inputLocked,
  });

  return renderTimelineItems(
    state.timeline,
    state.selectedTimelineIndex,
    palette,
  );
}

function latestRenderedTimelineContent(app: FakeInteractiveTuiApp | undefined): string {
  return app?.renderedTimelineContent.at(-1) ?? "";
}

function latestRenderedTimelineLayout(
  app: FakeInteractiveTuiApp | undefined,
): RenderedTimelineLayout | undefined {
  return app?.renderedTimelineLayouts.at(-1);
}

function selectedRenderedHeaderText(layout: RenderedTimelineLayout): string {
  const lines = layout.content.length === 0 ? [""] : layout.content.split("\n");
  assert.ok(
    layout.selectedLine >= 0 && layout.selectedLine < lines.length,
    `expected selectedLine ${layout.selectedLine} to be within 0..${Math.max(0, lines.length - 1)}`,
  );
  return (lines[layout.selectedLine] ?? "").replace(/\{\/?[^{}]+\}/g, "");
}

function createUserConfigStore(config: UserConfig): UserConfigStore & {
  saves: UserConfig[];
} {
  const saves: UserConfig[] = [];

  return {
    saves,
    load: async () => config,
    save: async (nextConfig) => {
      saves.push(nextConfig);
      config = nextConfig;
    },
  };
}

function createReturningUserConfigStore(): UserConfigStore & {
  saves: UserConfig[];
} {
  return createUserConfigStore({
    themeId: "hufflepuff",
  });
}

test("runInteractiveTui projects prompt submission, assistant output, and inspector toggles into renderer state", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async (input) => ({
      output: `assistant: ${input.prompt}`,
    }),
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  assert.equal(app?.latestState().timeline[0]?.kind, "welcome");
  assert.match(app?.latestState().timeline[0]?.summary ?? "", new RegExp(basename(projectRoot)));
  assert.match(latestRenderedTimelineContent(app), /Welcome back!/);
  assert.match(latestRenderedTimelineContent(app), /Hufflepuff Badger is standing by/);
  assert.doesNotMatch(latestRenderedTimelineContent(app), /\/inspect/);

  app?.toggleInspector();
  assert.equal(app?.latestState().inspectorOpen, true);

  app?.submit("inspect auth flow");

  await waitFor(() => {
    const state = app?.latestState();
    return (
      state?.timeline.length === 2 &&
      state.timeline[0]?.kind === "user" &&
      state.timeline[1]?.kind === "assistant"
    );
  }, "expected user and assistant timeline items");

  assert.deepEqual(
    app?.latestState().timeline.map((item) => item.kind),
    ["user", "assistant"],
  );
  assert.equal(app?.latestState().inputLocked, false);
  assert.equal(app?.latestState().runtimeState, "ready");
  assert.match(latestRenderedTimelineContent(app), /Submitted Input/);
  assert.match(latestRenderedTimelineContent(app), /inspect auth flow/);
  assert.match(latestRenderedTimelineContent(app), /Assistant/);
  assert.match(latestRenderedTimelineContent(app), /assistant: inspect auth flow/);

  const currentState = app?.latestState();
  assert.ok(currentState, "expected latest state to exist");

  app?.update({
    ...currentState,
    timeline: [
      ...currentState.timeline,
      {
        id: "execution-1",
        kind: "execution",
        summary: "Read files",
        body: "rg --files src\nsed -n '1,40p' src/main.ts",
        collapsed: false,
      },
    ],
    selectedTimelineIndex: currentState.timeline.length,
  });

  assert.match(latestRenderedTimelineContent(app), /Execution/);
  assert.match(latestRenderedTimelineContent(app), /Read files/);
  assert.match(latestRenderedTimelineContent(app), /rg --files src/);
  assert.match(latestRenderedTimelineContent(app), /sed -n '1,40p' src\/main\.ts/);

  app?.exit();
  await runPromise;

  assert.equal(app?.closed, true);
});

test("runInteractiveTui opens the picker on first launch and blocks prompt mode until a theme is applied", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const userConfigStore = createUserConfigStore({
    themeId: null,
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore,
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async (input) => ({
      output: `assistant: ${input.prompt}`,
    }),
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  assert.equal(app?.latestState().themePicker?.reason, "first_launch");
  assert.equal(app?.latestState().themePicker?.selectedThemeId, "hufflepuff");

  app?.submit("inspect auth flow");

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(app?.latestState().timeline.map((item) => item.kind), ["welcome"]);
  assert.equal(app?.latestState().themePicker?.reason, "first_launch");

  app?.toggleSelectedItem();

  await waitFor(() => app?.latestState().themePicker === null, "expected picker to close");

  assert.deepEqual(userConfigStore.saves, [{ themeId: "hufflepuff" }]);

  app?.submit("inspect auth flow");

  await waitFor(() => {
    const state = app?.latestState();
    return (
      state?.timeline.length === 2 &&
      state.timeline[0]?.kind === "user" &&
      state.timeline[1]?.kind === "assistant"
    );
  }, "expected normal prompt lifecycle after applying theme");

  app?.exit();
  await runPromise;
});

test("runInteractiveTui can force the first-launch picker for local testing even with a saved theme", async () => {
  const previousForceThemePicker = process.env.EXPECTO_FORCE_THEME_PICKER;
  process.env.EXPECTO_FORCE_THEME_PICKER = "1";

  try {
    const projectRoot = await makeProjectRoot();
    const context = await buildBootstrapContext({
      command: {
        kind: "interactive",
      },
      cwd: projectRoot,
    });
    const userConfigStore = createUserConfigStore({
      themeId: "hufflepuff",
    });
    let app: FakeInteractiveTuiApp | undefined;

    const runPromise = runInteractiveTui(context, {
      providerLabel: "anthropic",
      modelLabel: "claude-sonnet-4-20250514",
      branchLabel: "main",
      userConfigStore,
      createApp: (input) => {
        app = new FakeInteractiveTuiApp(input);
        return app;
      },
      assistantStep: async (input) => ({
        output: `assistant: ${input.prompt}`,
      }),
    });

    await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

    assert.equal(app?.latestState().activeThemeId, "hufflepuff");
    assert.equal(app?.latestState().themePicker?.reason, "first_launch");
    assert.equal(app?.latestState().themePicker?.selectedThemeId, "hufflepuff");

    app?.exit();
    await runPromise;
  } finally {
    if (previousForceThemePicker === undefined) {
      delete process.env.EXPECTO_FORCE_THEME_PICKER;
    } else {
      process.env.EXPECTO_FORCE_THEME_PICKER = previousForceThemePicker;
    }
  }
});

test("runInteractiveTui ignores the removed legacy BETA_FORCE_THEME_PICKER override", async () => {
  const previousForceThemePicker = process.env.BETA_FORCE_THEME_PICKER;
  delete process.env.EXPECTO_FORCE_THEME_PICKER;
  process.env.BETA_FORCE_THEME_PICKER = "1";

  try {
    const projectRoot = await makeProjectRoot();
    const context = await buildBootstrapContext({
      command: {
        kind: "interactive",
      },
      cwd: projectRoot,
    });
    const userConfigStore = createUserConfigStore({
      themeId: "hufflepuff",
    });
    let app: FakeInteractiveTuiApp | undefined;

    const runPromise = runInteractiveTui(context, {
      providerLabel: "anthropic",
      modelLabel: "claude-sonnet-4-20250514",
      branchLabel: "main",
      userConfigStore,
      createApp: (input) => {
        app = new FakeInteractiveTuiApp(input);
        return app;
      },
      assistantStep: async (input) => ({
        output: `assistant: ${input.prompt}`,
      }),
    });

    await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

    assert.equal(app?.latestState().themePicker, null);

    app?.exit();
    await runPromise;
  } finally {
    if (previousForceThemePicker === undefined) {
      delete process.env.BETA_FORCE_THEME_PICKER;
    } else {
      process.env.BETA_FORCE_THEME_PICKER = previousForceThemePicker;
    }
  }
});

test("runInteractiveTui closes cleanly when a shutdown signal is triggered while idle", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const shutdownController = new AbortController();
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    shutdownSignal: shutdownController.signal,
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async (input) => ({
      output: `assistant: ${input.prompt}`,
    }),
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  shutdownController.abort();
  await runPromise;

  assert.equal(app?.closed, true);
});

test("runInteractiveTui reopens the picker when /theme is executed", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  const userConfigStore = createUserConfigStore({
    themeId: "hufflepuff",
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore,
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async (input) => ({
      output: `assistant: ${input.prompt}`,
    }),
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  assert.equal(app?.latestState().themePicker, null);

  app?.submit("/theme");

  await waitFor(() => app?.latestState().themePicker?.reason === "command", "expected /theme to reopen picker");

  assert.equal(app?.latestState().themePicker?.selectedThemeId, "hufflepuff");

  app?.exit();
  await runPromise;
});

test("runInteractiveTui interrupts generation and restores the prompt draft", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;
  let abortObserved = false;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            abortObserved = true;
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  app?.submit("inspect auth flow");

  await waitFor(() => app?.latestState().runtimeState === "streaming", "expected streaming state");

  app?.interrupt();

  await waitFor(() => {
    const state = app?.latestState();
    return state?.runtimeState === "ready" && state.draft === "inspect auth flow";
  }, "expected interrupted prompt to be restored into the draft");

  assert.equal(abortObserved, true);
  assert.equal(app?.latestState().inputLocked, false);

  app?.exit();
  await runPromise;
});

test("runInteractiveTui keeps input locked until request_completed arrives", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      }),
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  app?.submit("inspect auth flow");
  await waitFor(() => app?.latestState().runtimeState === "streaming", "expected streaming state");

  app?.interrupt();

  await waitFor(() => {
    return app?.states.some((state) => {
      return state.runtimeState === "ready" && state.draft === "inspect auth flow";
    }) ?? false;
  }, "expected interrupted flow to return runtime state to ready");

  const interruptingStateIndex = app?.states.findIndex((state) => {
    return (
      state.activeRequestLedger?.phase === "interrupting" &&
      state.activeRequestLedger.interruptRequested &&
      state.inputLocked
    );
  }) ?? -1;

  assert.ok(
    interruptingStateIndex >= 0,
    "expected Ctrl+C to mark interrupt intent on active request ledger while input remains locked",
  );

  const firstReadyLockedIndex = app?.states.findIndex((state) => {
    return (
      state.runtimeState === "ready" &&
      state.draft === "inspect auth flow" &&
      state.inputLocked
    );
  }) ?? -1;

  assert.ok(
    firstReadyLockedIndex >= 0,
    "expected composer to remain locked through ready-state transition before request completion",
  );

  const firstReadyUnlockedIndex = app?.states.findIndex((state) => {
    return (
      state.runtimeState === "ready" &&
      state.draft === "inspect auth flow" &&
      !state.inputLocked
    );
  }) ?? -1;

  assert.ok(firstReadyUnlockedIndex > firstReadyLockedIndex);
  assert.ok(firstReadyUnlockedIndex > interruptingStateIndex);
  assert.equal(app?.latestState().inputLocked, false);

  app?.exit();
  await runPromise;
});

test("runInteractiveTui pre-seeds non-builtin interactive initialPrompt into foreground request lifecycle", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
      initialPrompt: "inspect auth flow",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async (input) => ({
      output: `assistant: ${input.prompt}`,
    }),
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  const firstState = app?.states[0];
  assert.ok(firstState);
  assert.equal(firstState.inputLocked, true);
  assert.equal(firstState.activeRequestLedger?.requestId, "request-turn-1");
  assert.equal(firstState.timeline[0]?.kind, "user");
  assert.equal(firstState.timeline[0]?.summary, "inspect auth flow");

  await waitFor(() => {
    const latestState = app?.latestState();

    return (
      latestState?.timeline.length === 2 &&
      latestState.timeline[0]?.kind === "user" &&
      latestState.timeline[1]?.kind === "assistant" &&
      latestState.inputLocked === false
    );
  }, "expected initial prompt lifecycle to complete and unlock the composer");

  app?.submit("follow up");

  await waitFor(() => {
    const latestState = app?.latestState();

    return (
      latestState?.timeline.length === 4 &&
      latestState.timeline[2]?.kind === "user" &&
      latestState.timeline[3]?.kind === "assistant"
    );
  }, "expected second prompt submission to append another user+assistant pair");

  const hasSecondPromptRequestLedger = app?.states.some((state) => {
    return state.activeRequestLedger?.requestId === "request-turn-2";
  }) ?? false;

  assert.equal(hasSecondPromptRequestLedger, true);

  app?.exit();
  await runPromise;
});

test("runInteractiveTui keeps builtin interactive initialPrompt outside prompt-ledger locking", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
      initialPrompt: "/branch",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async () => {
      assert.fail("builtin initial prompt should not call the assistant");
    },
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  const firstState = app?.states[0];
  assert.ok(firstState);
  assert.equal(firstState.inputLocked, false);
  assert.equal(firstState.activeRequestLedger, null);

  await waitFor(() => {
    const latestState = app?.latestState();
    return (
      latestState?.timeline.length === 2 &&
      latestState.timeline[0]?.kind === "system" &&
      latestState.timeline[1]?.kind === "execution"
    );
  }, "expected builtin initial prompt to render system + execution timeline items");

  const hasPromptLedgerState = app?.states.some((state) => {
    return state.activeRequestLedger?.requestId.startsWith("request-turn-") ?? false;
  }) ?? false;

  assert.equal(hasPromptLedgerState, false);

  app?.exit();
  await runPromise;
});

test("runInteractiveTui keeps unknown slash initialPrompt outside prompt-ledger locking", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
      initialPrompt: "/missing",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async () => {
      assert.fail("unknown slash initial prompt should not call the assistant");
    },
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  const firstState = app?.states[0];
  assert.ok(firstState);
  assert.equal(firstState.inputLocked, false);
  assert.equal(firstState.activeRequestLedger, null);

  await waitFor(() => {
    const state = app?.latestState();

    return (
      state?.timeline.length === 2 &&
      state.timeline.every((item) => item.kind === "system") &&
      state.timeline[0]?.summary === "Unknown command: /missing" &&
      state.timeline[1]?.summary === "Run /help to see available commands."
    );
  }, "expected unknown slash initial prompt to stay in local system output");

  const hasPromptLedgerState = app?.states.some((state) => {
    return state.activeRequestLedger?.requestId.startsWith("request-turn-") ?? false;
  }) ?? false;

  assert.equal(hasPromptLedgerState, false);
  assert.doesNotMatch(latestRenderedTimelineContent(app), /Submitted Input/);

  app?.exit();
  await runPromise;
});

test("runInteractiveTui accepts a second prompt after a tool-call continuation completes", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;
  let assistantCalls = 0;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async (input) => {
      assistantCalls += 1;

      if (assistantCalls === 1) {
        assert.equal(input.prompt, "first prompt");
        return {
          kind: "tool_calls" as const,
          responseId: "response-tool-calls",
          plannedExecutionIds: ["execution-1"],
        };
      }

      if (assistantCalls === 2) {
        assert.equal(input.prompt, undefined);
        return {
          kind: "output" as const,
          responseId: "response-follow-up",
          output: "assistant: first prompt complete",
          finishReason: "stop" as const,
        };
      }

      return {
        kind: "output" as const,
        responseId: `response-${assistantCalls}`,
        output: `assistant: ${input.prompt}`,
        finishReason: "stop" as const,
      };
    },
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  app?.submit("first prompt");

  await waitFor(() => {
    const state = app?.latestState();
    return (
      state?.timeline.length === 4 &&
      state.timeline[0]?.kind === "user" &&
      state.timeline[1]?.kind === "assistant" &&
      state.timeline[2]?.kind === "execution" &&
      state.timeline[3]?.kind === "assistant" &&
      state.timeline[3]?.summary.includes("first prompt complete") &&
      state.inputLocked === false
    );
  }, "expected first prompt to finish after the tool-call continuation");

  app?.submit("second prompt");

  await waitFor(() => {
    const state = app?.latestState();
    return (
      state?.timeline.length === 6 &&
      state.timeline[4]?.kind === "user" &&
      state.timeline[5]?.kind === "assistant" &&
      state.timeline[5]?.summary.includes("assistant: second prompt") &&
      state.inputLocked === false
    );
  }, "expected second prompt to complete after a prior tool-call continuation");

  app?.exit();
  await runPromise;
});

test("runInteractiveTui exposes slash command suggestions from the composer draft", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async () => ({
      output: "assistant: ok",
    }),
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  app?.setDraft("/");

  assert.equal(app?.latestState().commandMenu.visible, true);
  assert.deepEqual(
    app?.latestState().commandMenu.items.map((item) => item.name),
    ["/help", "/status", "/clear", "/theme", "/exit", "/branch"],
  );
  assert.deepEqual(
    app?.latestState().commandMenu.items.map((item) => item.id),
    [
      "session.help",
      "session.status",
      "session.clear",
      "session.theme",
      "session.exit",
      "project.branch",
    ],
  );

  app?.setDraft("/st");

  assert.equal(app?.latestState().commandMenu.visible, true);
  assert.deepEqual(
    app?.latestState().commandMenu.items.map((item) => item.name),
    ["/status"],
  );

  app?.setDraft("/status details");

  assert.equal(app?.latestState().commandMenu.visible, false);
  assert.deepEqual(app?.latestState().commandMenu.items, []);

  app?.setDraft("/status ");

  assert.equal(app?.latestState().commandMenu.visible, false);
  assert.deepEqual(app?.latestState().commandMenu.items, []);

  app?.setDraft(" /status");

  assert.equal(app?.latestState().commandMenu.visible, false);
  assert.deepEqual(app?.latestState().commandMenu.items, []);

  app?.setDraft("/ ");

  assert.equal(app?.latestState().commandMenu.visible, false);
  assert.deepEqual(app?.latestState().commandMenu.items, []);

  app?.setDraft("hello");

  assert.equal(app?.latestState().commandMenu.visible, false);
  assert.deepEqual(app?.latestState().commandMenu.items, []);

  app?.exit();
  await runPromise;
});

test("runInteractiveTui submits the exact typed slash draft locally even when a suggestion is highlighted", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async () => {
      assert.fail("unknown slash input should be handled locally, not sent to the assistant");
    },
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  app?.setDraft("/sta");

  assert.equal(app?.latestState().commandMenu.visible, true);
  assert.deepEqual(
    app?.latestState().commandMenu.items.map((item) => item.name),
    ["/status"],
  );

  app?.moveSelectionDown();
  assert.equal(app?.latestState().commandMenu.selectedIndex, 0);

  app?.submit("/sta");

  await waitFor(() => {
    const state = app?.latestState();

    return (
      state?.timeline.length === 2 &&
      state.timeline.every((item) => item.kind === "system") &&
      state.timeline[0]?.summary === "Unknown command: /sta" &&
      state.timeline[1]?.summary === "Run /help to see available commands."
    );
  }, "expected the exact typed draft to stay local without autocomplete or prompt projection");

  const hasPromptLedgerState = app?.states.some((state) => {
    return state.activeRequestLedger?.requestId.startsWith("request-turn-") ?? false;
  }) ?? false;

  assert.equal(hasPromptLedgerState, false);
  assert.equal(app?.latestState().activeRequestLedger, null);
  assert.equal(app?.latestState().inputLocked, false);
  assert.match(latestRenderedTimelineContent(app), /Unknown command: \/sta/);
  assert.match(latestRenderedTimelineContent(app), /Run \/help to see available commands\./);
  assert.doesNotMatch(latestRenderedTimelineContent(app), /\/status/);
  assert.doesNotMatch(latestRenderedTimelineContent(app), /Submitted Input/);

  app?.exit();
  await runPromise;
});

test("runInteractiveTui keeps /help local in the timeline without seeding prompt lifecycle", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async () => {
      assert.fail("/help should not reach the assistant step");
    },
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  app?.submit("/help");

  await waitFor(() => {
    const state = app?.latestState();
    return (
      state !== undefined &&
      state.timeline.length > 0 &&
      state.timeline.every((item) => item.kind === "system") &&
      state.timeline[0]?.summary === "Available commands"
    );
  }, "expected /help to render only local system output");

  const hasPromptLedgerState = app?.states.some((state) => {
    return state.activeRequestLedger?.requestId.startsWith("request-turn-") ?? false;
  }) ?? false;

  assert.equal(hasPromptLedgerState, false);
  assert.equal(app?.latestState().activeRequestLedger, null);
  assert.equal(app?.latestState().inputLocked, false);
  assert.doesNotMatch(latestRenderedTimelineContent(app), /Submitted Input/);
  assert.doesNotMatch(latestRenderedTimelineContent(app), /Assistant/);

  app?.exit();
  await runPromise;
});

test("runInteractiveTui closes /exit, bare exit, and bare quit without projecting a prompt lifecycle", async () => {
  for (const prompt of ["/exit", "exit", "quit"]) {
    const projectRoot = await makeProjectRoot();
    const context = await buildBootstrapContext({
      command: {
        kind: "interactive",
      },
      cwd: projectRoot,
    });
    let app: FakeInteractiveTuiApp | undefined;

    const runPromise = runInteractiveTui(context, {
      providerLabel: "anthropic",
      modelLabel: "claude-sonnet-4-20250514",
      branchLabel: "main",
      userConfigStore: createReturningUserConfigStore(),
      createApp: (input) => {
        app = new FakeInteractiveTuiApp(input);
        return app;
      },
      assistantStep: async () => {
        assert.fail(`${prompt} should not reach the assistant step`);
      },
    });

    await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

    app?.submit(prompt);
    await runPromise;

    const state = app?.latestState();

    assert.ok(state, "expected latest state to exist");
    assert.deepEqual(state.timeline.map((item) => item.kind), ["welcome"]);
    assert.equal(state.inputLocked, false);
    assert.equal(state.activeRequestLedger, null);
    assert.equal(app?.closed, true);
  }
});

test("runInteractiveTui forwards terminal IO through the app factory input", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;
  let observedTerminal: TerminalTuiIo | undefined;

  const terminal: TerminalTuiIo = {
    stdin: {
      on() {},
      setRawMode() {},
      isTTY: true,
    },
    stdout: {
      write() {},
      columns: 80,
      rows: 24,
    },
  };

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    terminal,
    createApp: (input) => {
      observedTerminal = input.terminal;
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async () => ({
      output: "assistant: ok",
    }),
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  assert.equal(observedTerminal, terminal);

  app?.exit();
  await runPromise;
});

test("runInteractiveTui uses composer selection keys for slash suggestions before timeline navigation", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async () => ({
      output: "assistant: ok",
    }),
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  app?.setDraft("/");
  app?.moveSelectionDown();
  app?.moveSelectionDown();

  assert.equal(app?.latestState().commandMenu.visible, true);
  assert.equal(app?.latestState().commandMenu.selectedIndex, 2);
  assert.equal(app?.latestState().commandMenu.items[2]?.name, "/clear");
  assert.equal(app?.latestState().selectedTimelineIndex, 0);

  app?.setDraft("hello");

  assert.equal(app?.latestState().commandMenu.visible, false);
  app?.submit("inspect auth flow");

  await waitFor(() => {
    const state = app?.latestState();
    return (
      state?.timeline.length === 2 &&
      state.timeline[0]?.kind === "user" &&
      state.timeline[1]?.kind === "assistant"
    );
  }, "expected real timeline items after submitting a prompt");

  assert.match(latestRenderedTimelineContent(app), /Submitted Input/);
  assert.match(latestRenderedTimelineContent(app), /assistant: ok/);
  assert.equal(app?.latestState().selectedTimelineIndex, 1);

  app?.moveSelectionUp();
  assert.equal(app?.latestState().selectedTimelineIndex, 0);
  {
    const layout = latestRenderedTimelineLayout(app);
    assert.ok(layout, "expected interactive TUI app to capture rendered timeline layout");
    const header = selectedRenderedHeaderText(layout);
    assert.match(header, /^> /);
    assert.match(header, /Submitted Input/);
    assert.doesNotMatch(header, /inspect auth flow/);
  }

  app?.moveSelectionDown();
  assert.equal(app?.latestState().selectedTimelineIndex, 1);
  {
    const layout = latestRenderedTimelineLayout(app);
    assert.ok(layout, "expected interactive TUI app to capture rendered timeline layout");
    const header = selectedRenderedHeaderText(layout);
    assert.match(header, /^> /);
    assert.match(header, /Assistant:/);
  }

  app?.moveSelectionUp();
  assert.equal(app?.latestState().selectedTimelineIndex, 0);

  app?.moveSelectionDown();
  assert.equal(app?.latestState().selectedTimelineIndex, 1);

  app?.exit();
  await runPromise;
});

test("runInteractiveTui intercepts /inspect locally and invokes pager handoff without touching SessionManager", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;
  const pagerPaths: string[] = [];

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async () => {
      assert.fail("/inspect should never reach the assistant step");
    },
    executionLogStore: {
      ensureExecutionLog: async () => "/tmp/exec_exec-1.log",
      appendChunk: async () => "/tmp/exec_exec-1.log",
      resolveLogPath: async (executionId) => {
        return executionId === "exec-1" ? "/tmp/exec_exec-1.log" : null;
      },
      flush: async () => {},
    },
    openPager: async (logPath) => {
      pagerPaths.push(logPath);
    },
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  app?.inspectExecution("exec-1");

  await waitFor(() => pagerPaths.length === 1, "expected /inspect to invoke the pager");

  assert.deepEqual(pagerPaths, ["/tmp/exec_exec-1.log"]);
  assert.equal(app?.pagerSuspended, 1);
  assert.equal(app?.pagerResumed, 1);
  assert.equal(app?.latestState().timeline.length, 1);
  assert.equal(app?.latestState().timeline[0]?.kind, "welcome");

  app?.exit();
  await runPromise;
});

test("runInteractiveTui projects /branch execution output into a real execution timeline item", async () => {
  const projectRoot = await makeProjectRoot();
  const context = await buildBootstrapContext({
    command: {
      kind: "interactive",
    },
    cwd: projectRoot,
  });
  let app: FakeInteractiveTuiApp | undefined;

  const runPromise = runInteractiveTui(context, {
    providerLabel: "anthropic",
    modelLabel: "claude-sonnet-4-20250514",
    branchLabel: "main",
    userConfigStore: createReturningUserConfigStore(),
    createApp: (input) => {
      app = new FakeInteractiveTuiApp(input);
      return app;
    },
    assistantStep: async () => {
      assert.fail("slash commands should not call the assistant step");
    },
  });

  await waitFor(() => app !== undefined, "expected interactive TUI app to be created");

  app?.submit("/branch");

  await waitFor(() => {
    const state = app?.latestState();

    return (
      state?.timeline.length === 2 &&
      state.timeline[0]?.kind === "system" &&
      state.timeline[1]?.kind === "execution"
    );
  }, "expected /branch to render system and execution timeline items");

  const state = app?.latestState();
  assert.ok(state, "expected latest state to exist");
  assert.equal(state.timeline[1]?.summary, "Read git branch");
  assert.equal(state.timeline[1]?.collapsed, true);
  assert.equal(state.inputLocked, false);
  assert.deepEqual(state.timeline[1]?.executionTranscript?.headLines, [
    "$ git rev-parse --abbrev-ref HEAD",
  ]);
  assert.equal(state.timeline[1]?.executionTranscript?.pendingFragment, "no-git");
  assert.match(latestRenderedTimelineContent(app), /Execution/);
  assert.match(latestRenderedTimelineContent(app), /Read git branch/);
  assert.doesNotMatch(latestRenderedTimelineContent(app), /git rev-parse --abbrev-ref HEAD/);

  app?.toggleSelectedItem();

  assert.match(latestRenderedTimelineContent(app), /git rev-parse --abbrev-ref HEAD/);

  app?.exit();
  await runPromise;
});
