import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { buildBootstrapContext } from "../../src/runtime/bootstrap-context.ts";
import type { RenderedTimelineLayout } from "../../src/tui/renderer-blessed/block-layout.ts";
import { renderTimelineItems } from "../../src/tui/renderer-blessed/block-renderer.ts";
import { createRendererPalette } from "../../src/tui/renderer-blessed/tui-theme.ts";
import { runInteractiveTui } from "../../src/tui/run-interactive-tui.ts";
import type { InteractiveTuiApp, InteractiveTuiAppFactoryInput } from "../../src/tui/tui-app.ts";
import type { TuiState } from "../../src/tui/tui-types.ts";

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "beta-agent-tui-"));
  await mkdir(join(root, ".beta-agent", "docs"), { recursive: true });
  await writeFile(join(root, ".beta-agent", "docs", "00-requirements.md"), "# Requirements\n");
  await writeFile(join(root, ".beta-agent", "docs", "01-plan.md"), "# Plan\n");
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

  submit(prompt: string): void {
    this.handlers.onSubmit(prompt);
  }

  setDraft(draft: string): void {
    this.handlers.onDraftChange(draft);
  }

  toggleInspector(): void {
    this.handlers.onToggleInspector();
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
  assert.match(latestRenderedTimelineContent(app), /Enter send/);

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
    ["/help", "/clear", "/status", "/branch", "/exit"],
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

  app?.setDraft("hello");

  assert.equal(app?.latestState().commandMenu.visible, false);
  assert.deepEqual(app?.latestState().commandMenu.items, []);

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
  assert.equal(app?.latestState().commandMenu.items[2]?.name, "/status");
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
    assert.match(header, /Submitted Input:/);
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
  assert.equal(
    state.timeline[1]?.body,
    "$ git rev-parse --abbrev-ref HEAD\nno-git",
  );
  assert.match(latestRenderedTimelineContent(app), /Execution/);
  assert.match(latestRenderedTimelineContent(app), /Read git branch/);
  assert.doesNotMatch(latestRenderedTimelineContent(app), /git rev-parse --abbrev-ref HEAD/);

  app?.toggleSelectedItem();

  assert.match(latestRenderedTimelineContent(app), /git rev-parse --abbrev-ref HEAD/);

  app?.exit();
  await runPromise;
});
