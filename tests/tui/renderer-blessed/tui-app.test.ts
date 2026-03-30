import assert from "node:assert/strict";
import test from "node:test";
import blessed from "neo-blessed";

import type { TuiState } from "../../../src/tui/tui-types.ts";
import * as tuiApp from "../../../src/tui/renderer-blessed/tui-app.ts";

type TuiAppRenderExports = {
  renderInspector?: (state: TuiState) => string;
  renderStatusBar?: (state: TuiState) => string;
};

function createState(overrides: Partial<TuiState> = {}): TuiState {
  return {
    sessionId: "sess{42}",
    focus: "composer",
    timelineMode: "scroll",
    inspectorOpen: true,
    runtimeState: "tool_running",
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
    projectLabel: "proj{root}",
    branchLabel: "feature/{safety}",
    providerLabel: "open{router}",
    modelLabel: "gpt-{5}",
    contextMetrics: {
      percent: 73,
      rules: 4,
      hooks: 2,
      docs: 1,
    },
    ...overrides,
    activeThemeId: overrides.activeThemeId ?? "hufflepuff",
    themePicker: overrides.themePicker ?? null,
    activeRequestLedger: overrides.activeRequestLedger ?? null,
  };
}

function stripBlessedTags(value: string): string {
  return value.replace(/\{[^}]+\}/g, "");
}

test("renderInspector escapes brace characters in dynamic values before tagged rendering", () => {
  const { renderInspector } = tuiApp as TuiAppRenderExports;

  assert.equal(typeof renderInspector, "function");

  const output = renderInspector!(createState());

  assert.deepEqual(output.split("\n").slice(0, 5), [
    "Session sess{open}42{close}",
    "Project proj{open}root{close}",
    "Branch feature/{open}safety{close}",
    "Provider open{open}router{close}",
    "Model gpt-{open}5{close}",
  ]);
});

test("renderStatusBar escapes brace characters in dynamic values while preserving readable separators", () => {
  const { renderStatusBar } = tuiApp as TuiAppRenderExports;

  assert.equal(typeof renderStatusBar, "function");

  const output = renderStatusBar!(createState());

  assert.match(
    output,
    /^expecto \| open\{open\}router\{close\}\/gpt-\{open\}5\{close\} \| proj\{open\}root\{close\} \| feature\/\{open\}safety\{close\}/,
  );
});

test("createBlessedTuiApp enables timeline wheel scrolling in scroll mode and releases mouse in select mode", async () => {
  const createdBoxes: Array<{
    options: Record<string, unknown>;
    events: string[];
    handlers: Record<string, Array<(...args: unknown[]) => void>>;
    node: {
      scrollCalls: number[];
    };
  }> = [];
  const originalScreen = blessed.screen;
  const originalBox = blessed.box;
  let enableMouseCalls = 0;
  let disableMouseCalls = 0;

  const fakeScreen = {
    append() {},
    on() {},
    render() {},
    destroy() {},
    program: {
      enableMouse() {
        enableMouseCalls += 1;
      },
      disableMouse() {
        disableMouseCalls += 1;
      },
      showCursor() {},
      hideCursor() {},
      cup() {},
    },
    width: 120,
  };

  try {
    (blessed as unknown as { screen: typeof blessed.screen }).screen = () => fakeScreen as never;
    (blessed as unknown as { box: typeof blessed.box }).box = ((options: Record<string, unknown>) => {
      const boxState = {
        options,
        events: [] as string[],
        handlers: {} as Record<string, Array<(...args: unknown[]) => void>>,
        node: {
          scrollCalls: [] as number[],
        },
      };
      createdBoxes.push(boxState);

      return {
        ...options,
        style: { border: {} },
        on(eventName: string, handler?: (...args: unknown[]) => void) {
          boxState.events.push(eventName);
          if (handler) {
            boxState.handlers[eventName] ??= [];
            boxState.handlers[eventName].push(handler);
          }
        },
        setLabel() {},
        setContent() {},
        setScrollPerc() {},
        scrollTo() {},
        scroll(offset: number) {
          boxState.node.scrollCalls.push(offset);
        },
      } as never;
    }) as typeof blessed.box;

    const app = tuiApp.createBlessedTuiApp({
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
        onExit() {},
      },
    });

    await app.start();

    const timelineBox = createdBoxes[0];
    assert.ok(timelineBox, "expected the timeline box options to be captured");

    assert.equal(timelineBox.options.mouse, true);
    assert.ok(timelineBox.options.scrollbar, "expected a visible timeline scrollbar");
    assert.equal(enableMouseCalls, 1);

    timelineBox.handlers.wheelup?.[0]?.();
    timelineBox.handlers.wheeldown?.[0]?.();
    assert.deepEqual(timelineBox.node.scrollCalls, [-3, 3]);

    app.update(
      createState({
        timelineMode: "select",
      }),
    );
    timelineBox.handlers.wheelup?.[0]?.();

    assert.equal(disableMouseCalls, 1);
    assert.deepEqual(timelineBox.node.scrollCalls, [-3, 3]);
  } finally {
    (blessed as unknown as { screen: typeof blessed.screen }).screen = originalScreen;
    (blessed as unknown as { box: typeof blessed.box }).box = originalBox;
  }
});

test("createBlessedTuiApp preserves the current viewport when selection is unchanged", async () => {
  const createdBoxes: Array<{
    options: Record<string, unknown>;
    currentScroll: number;
    scrollToCalls: number[];
    setScrollPercCalls: number[];
  }> = [];
  const originalScreen = blessed.screen;
  const originalBox = blessed.box;

  const fakeScreen = {
    append() {},
    on() {},
    render() {},
    destroy() {},
    program: {
      enableMouse() {},
      disableMouse() {},
      showCursor() {},
      hideCursor() {},
      cup() {},
    },
    width: 120,
  };

  try {
    (blessed as unknown as { screen: typeof blessed.screen }).screen = () => fakeScreen as never;
    (blessed as unknown as { box: typeof blessed.box }).box = ((options: Record<string, unknown>) => {
      const boxState = {
        options,
        currentScroll: 0,
        scrollToCalls: [] as number[],
        setScrollPercCalls: [] as number[],
      };
      createdBoxes.push(boxState);

      return {
        ...options,
        style: { border: {} },
        on() {},
        setLabel() {},
        setContent() {},
        setScrollPerc(value: number) {
          boxState.setScrollPercCalls.push(value);
        },
        scrollTo(offset: number) {
          boxState.currentScroll = offset;
          boxState.scrollToCalls.push(offset);
        },
        getScroll() {
          return boxState.currentScroll;
        },
      } as never;
    }) as typeof blessed.box;

    const timeline = [
      {
        id: "user-1",
        kind: "user" as const,
        summary: "first",
        body: "first",
        collapsed: false,
      },
      {
        id: "assistant-1",
        kind: "assistant" as const,
        summary: "second",
        body: "second",
        collapsed: false,
      },
    ];

    const app = tuiApp.createBlessedTuiApp({
      initialState: createState({
        timeline,
        selectedTimelineIndex: 0,
      }),
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
        onExit() {},
      },
    });

    await app.start();

    const timelineBox = createdBoxes[0];
    assert.ok(timelineBox, "expected the timeline box to exist");

    timelineBox.currentScroll = 9;

    app.update(
      createState({
        timeline,
        selectedTimelineIndex: 0,
        draft: "keep scroll stable",
      }),
    );

    assert.equal(timelineBox.currentScroll, 9);
  } finally {
    (blessed as unknown as { screen: typeof blessed.screen }).screen = originalScreen;
    (blessed as unknown as { box: typeof blessed.box }).box = originalBox;
  }
});

test("createBlessedTuiApp soft-wraps composer content and places the cursor on the wrapped line", async () => {
  const createdBoxes: Array<{
    options: Record<string, unknown>;
    setContentCalls: string[];
  }> = [];
  const originalScreen = blessed.screen;
  const originalBox = blessed.box;
  const cupCalls: Array<[number, number]> = [];
  let showCursorCalls = 0;

  const fakeScreen = {
    append() {},
    on() {},
    render() {},
    destroy() {},
    program: {
      enableMouse() {},
      disableMouse() {},
      showCursor() {
        showCursorCalls += 1;
      },
      hideCursor() {},
      cup(y: number, x: number) {
        cupCalls.push([y, x]);
      },
    },
    width: 12,
  };

  try {
    (blessed as unknown as { screen: typeof blessed.screen }).screen = () => fakeScreen as never;
    (blessed as unknown as { box: typeof blessed.box }).box = ((options: Record<string, unknown>) => {
      const boxState = {
        options,
        setContentCalls: [] as string[],
      };
      createdBoxes.push(boxState);

      return {
        ...options,
        style: { border: {} },
        lpos: options.label === " Composer "
          ? {
              xi: 0,
              yi: 16,
            }
          : undefined,
        on() {},
        setLabel() {},
        setContent(value: string) {
          boxState.setContentCalls.push(value);
        },
        setScrollPerc() {},
        scrollTo() {},
        getScroll() {
          return 0;
        },
      } as never;
    }) as typeof blessed.box;

    const app = tuiApp.createBlessedTuiApp({
      initialState: createState({
        draft: "abcdefghij",
        focus: "composer",
      }),
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
        onExit() {},
      },
    });

    await app.start();

    const composerBox = createdBoxes[1];
    assert.ok(composerBox, "expected the composer box to exist");
    const latestComposerContent = stripBlessedTags(composerBox.setContentCalls.at(-1) ?? "");

    assert.match(latestComposerContent, /^abcdefgh$/m);
    assert.match(latestComposerContent, /^ij$/m);
    assert.deepEqual(cupCalls.at(-1), [18, 4]);
    assert.ok(showCursorCalls > 0, "expected the composer cursor to be shown");
  } finally {
    (blessed as unknown as { screen: typeof blessed.screen }).screen = originalScreen;
    (blessed as unknown as { box: typeof blessed.box }).box = originalBox;
  }
});
