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
    activeRequestLedger: overrides.activeRequestLedger ?? null,
  };
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
    /^beta \| open\{open\}router\{close\}\/gpt-\{open\}5\{close\} \| proj\{open\}root\{close\} \| feature\/\{open\}safety\{close\}/,
  );
});

test("createBlessedTuiApp keeps timeline mouse capture disabled for terminal-native selection", () => {
  const createdBoxes: Array<{
    options: Record<string, unknown>;
    events: string[];
  }> = [];
  const originalScreen = blessed.screen;
  const originalBox = blessed.box;

  const fakeScreen = {
    append() {},
    on() {},
    render() {},
    destroy() {},
    program: {
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
      };
      createdBoxes.push(boxState);

      return {
        ...options,
        style: { border: {} },
        on(eventName: string) {
          boxState.events.push(eventName);
        },
        setLabel() {},
        setContent() {},
        setScrollPerc() {},
        scrollTo() {},
      } as never;
    }) as typeof blessed.box;

    tuiApp.createBlessedTuiApp({
      initialState: createState(),
      handlers: {
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
      },
    });
  } finally {
    (blessed as unknown as { screen: typeof blessed.screen }).screen = originalScreen;
    (blessed as unknown as { box: typeof blessed.box }).box = originalBox;
  }

  const timelineBox = createdBoxes[0];
  assert.ok(timelineBox, "expected the timeline box options to be captured");
  const timelineOptions = timelineBox.options;
  assert.equal(timelineOptions.mouse, false);
  assert.deepEqual(
    timelineBox.events.filter((eventName) => eventName === "wheelup" || eventName === "wheeldown"),
    [],
  );
});
