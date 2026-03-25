import blessed from "neo-blessed";
import type { Widgets } from "blessed";

import type { InteractiveTuiApp, InteractiveTuiAppFactoryInput } from "../tui-app.ts";
import type { TuiRuntimeState, TuiState } from "../tui-types.ts";
import {
  type RendererPalette,
  createRendererPalette,
  renderCommandMenuMarkup,
  renderComposerMarkup,
} from "./tui-theme.ts";
import { renderTimelineItems } from "./block-renderer.ts";
import {
  type BlessedKey,
  getCommandMenuLayout,
  interpretKeypress,
  resolveBlessedTerminal,
} from "./tui-runtime.ts";
import { getComposerCursorPlacement } from "./tui-cursor.ts";
import {
  findPageSelectionIndex,
  getTimelineViewportLineCount,
} from "./tui-scroll.ts";

const STATUS_HEIGHT = 1;
const COMPOSER_HEIGHT = 7;
const INSPECTOR_WIDTH = 32;
const COMPOSER_PADDING_LEFT = 1;
const COMPOSER_PADDING_TOP = 0;

function displayRuntimeState(runtimeState: TuiRuntimeState): string {
  switch (runtimeState) {
    case "streaming":
      return "Thinking";
    case "tool_running":
      return "Running tool";
    case "interrupted":
      return "Interrupted";
    case "error":
      return "Needs attention";
    case "idle":
      return "Idle";
    case "ready":
      return "Done";
  }
}

function escapeTaggedText(value: string): string {
  return blessed.escape(value);
}

function renderTimeline(
  state: TuiState,
  palette: RendererPalette,
  wrapWidth?: number,
): { content: string; selectedLine: number; itemStartLines: number[] } {
  const options = wrapWidth === undefined ? undefined : { wrapWidth };
  return renderTimelineItems(
    state.timeline,
    state.selectedTimelineIndex,
    palette,
    options,
  );
}

export function renderInspector(state: TuiState): string {
  return [
    `Session ${escapeTaggedText(state.sessionId)}`,
    `Project ${escapeTaggedText(state.projectLabel)}`,
    `Branch ${escapeTaggedText(state.branchLabel)}`,
    `Provider ${escapeTaggedText(state.providerLabel)}`,
    `Model ${escapeTaggedText(state.modelLabel)}`,
    "",
    `Context ${state.contextMetrics.percent}%`,
    `${state.contextMetrics.rules} rules`,
    `${state.contextMetrics.hooks} hooks`,
    `${state.contextMetrics.docs} docs`,
    "",
    `State ${displayRuntimeState(state.runtimeState)}`,
    state.inputLocked ? "Composer locked" : "Composer ready",
  ].join("\n");
}

export function renderStatusBar(state: TuiState): string {
  return [
    "beta",
    `${escapeTaggedText(state.providerLabel)}/${escapeTaggedText(state.modelLabel)}`,
    escapeTaggedText(state.projectLabel),
    escapeTaggedText(state.branchLabel),
    `Context ${state.contextMetrics.percent}%`,
    `${state.contextMetrics.rules} rules`,
    `${state.contextMetrics.hooks} hooks`,
    `${state.contextMetrics.docs} docs`,
    displayRuntimeState(state.runtimeState),
    "Enter send",
    "Ctrl+J newline",
    "Tab inspector",
  ].join(" | ");
}

function truncateSingleLine(text: string, maxWidth: number): string {
  const characters = Array.from(text);

  if (characters.length <= maxWidth) {
    return text;
  }

  if (maxWidth <= 1) {
    return characters.slice(0, maxWidth).join("");
  }

  return `${characters.slice(0, maxWidth - 1).join("")}…`;
}

export function resolveTimelineWrapWidth(options: {
  boxWidth?: number;
  border?: boolean;
  paddingLeft?: number;
  paddingRight?: number;
}): number | undefined {
  if (typeof options.boxWidth !== "number" || !Number.isFinite(options.boxWidth)) {
    return undefined;
  }

  const borderWidth = options.border ? 2 : 0;
  const paddingLeft = typeof options.paddingLeft === "number" ? options.paddingLeft : 0;
  const paddingRight = typeof options.paddingRight === "number" ? options.paddingRight : 0;
  const contentWidth = options.boxWidth - borderWidth - paddingLeft - paddingRight;

  return Math.max(1, contentWidth);
}

export function createBlessedTuiApp(
  input: InteractiveTuiAppFactoryInput,
): InteractiveTuiApp {
  let state = input.initialState;
  let localDraft = input.initialState.draft;
  let closed = false;

  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    dockBorders: true,
    useBCE: true,
    autoPadding: false,
    title: "beta",
    warnings: false,
    terminal: resolveBlessedTerminal(process.env.TERM),
  });
  const timeline = blessed.box({
    top: 0,
    left: 0,
    right: 0,
    bottom: COMPOSER_HEIGHT + STATUS_HEIGHT,
    border: "line",
    scrollable: true,
    alwaysScroll: true,
    keys: false,
    mouse: false,
    tags: true,
    label: " Timeline ",
    padding: {
      left: COMPOSER_PADDING_LEFT,
      right: 1,
      top: COMPOSER_PADDING_TOP,
      bottom: 0,
    },
    style: {
      border: {
        fg: "yellow",
      },
      fg: "white",
    },
  });
  const composer = blessed.box({
    left: 0,
    right: 0,
    bottom: STATUS_HEIGHT,
    height: COMPOSER_HEIGHT,
    border: "line",
    tags: true,
    label: " Composer ",
    padding: {
      left: 1,
      right: 1,
      top: 0,
      bottom: 0,
    },
    style: {
      border: {
        fg: "green",
      },
      fg: "white",
    },
  });
  const commandMenu = blessed.box({
    left: 0,
    right: 0,
    bottom: COMPOSER_HEIGHT + STATUS_HEIGHT,
    height: 0,
    border: "line",
    tags: true,
    label: " Commands ",
    hidden: true,
    padding: {
      left: 1,
      right: 1,
      top: 0,
      bottom: 0,
    },
    style: {
      border: {
        fg: "green",
      },
      fg: "white",
    },
  });
  const inspector = blessed.box({
    top: 0,
    right: 0,
    width: INSPECTOR_WIDTH,
    bottom: STATUS_HEIGHT,
    border: "line",
    label: " Context Inspector ",
    hidden: !state.inspectorOpen,
    tags: true,
    padding: {
      left: 1,
      right: 1,
      top: 0,
      bottom: 0,
    },
    style: {
      border: {
        fg: "cyan",
      },
      fg: "white",
    },
  });
  const statusBar = blessed.box({
    left: 0,
    right: 0,
    bottom: 0,
    height: STATUS_HEIGHT,
    tags: true,
    style: {
      fg: "black",
      bg: "white",
    },
  });

  screen.append(timeline);
  screen.append(commandMenu);
  screen.append(composer);
  screen.append(inspector);
  screen.append(statusBar);

  const syncLayout = (): void => {
    const inspectorOffset = state.inspectorOpen ? INSPECTOR_WIDTH : 0;
    const commandMenuLayout = getCommandMenuLayout(state.commandMenu);

    timeline.right = inspectorOffset;
    timeline.bottom = COMPOSER_HEIGHT + STATUS_HEIGHT + commandMenuLayout.height;
    commandMenu.right = inspectorOffset;
    commandMenu.hidden = !commandMenuLayout.visible;
    commandMenu.height = commandMenuLayout.height;
    composer.right = inspectorOffset;
    inspector.hidden = !state.inspectorOpen;
  };

  const resolveCurrentTimelineWrapWidth = (): number | undefined => {
    const inspectorOffset = state.inspectorOpen ? INSPECTOR_WIDTH : 0;
    const padding = (timeline as unknown as {
      padding?: {
        left?: number;
        right?: number;
      };
    }).padding;

    // Prefer exact box geometry when available (post-render), otherwise fall
    // back to known terminal width minus the inspector offset.
    const widthFromLpos = timeline.lpos !== undefined
      ? timeline.lpos.xl - timeline.lpos.xi + 1
      : undefined;
    const widthFromScreen =
      typeof screen.width === "number" ? screen.width - inspectorOffset : undefined;
    const widthFromStdout =
      typeof process.stdout.columns === "number"
        ? process.stdout.columns - inspectorOffset
        : undefined;

    const boxWidth = widthFromLpos ?? widthFromScreen ?? widthFromStdout;

    return resolveTimelineWrapWidth({
      border: Boolean(timeline.border),
      ...(boxWidth === undefined ? {} : { boxWidth }),
      ...(typeof padding?.left === "number" ? { paddingLeft: padding.left } : {}),
      ...(typeof padding?.right === "number" ? { paddingRight: padding.right } : {}),
    });
  };

  const syncTimelineScroll = (selectedLine: number): void => {
    if (state.selectedTimelineIndex >= state.timeline.length - 1) {
      timeline.setScrollPerc(100);
      return;
    }

    timeline.scrollTo(Math.max(0, selectedLine - 1));
  };

  const moveSelectionByDelta = (delta: number): void => {
    if (delta === 0) {
      return;
    }

    const moveOne = delta > 0
      ? input.handlers.onMoveSelectionDown
      : input.handlers.onMoveSelectionUp;

    for (let step = 0; step < Math.abs(delta); step += 1) {
      moveOne();
    }
  };

  const moveSelectionByPage = (direction: "up" | "down"): void => {
    const palette = createRendererPalette({
      focus: state.focus,
      inputLocked: state.inputLocked,
    });
    const renderedTimeline = renderTimeline(state, palette, resolveCurrentTimelineWrapWidth());
    const targetIndex = findPageSelectionIndex({
      itemStartLines: renderedTimeline.itemStartLines,
      selectedIndex: state.selectedTimelineIndex,
      viewportLines: getTimelineViewportLineCount(
        timeline.lpos !== undefined
          ? {
              boxPosition: {
                yi: timeline.lpos.yi,
                yl: timeline.lpos.yl,
              },
            }
          : {
              ...(typeof timeline.height === "number"
                ? {
                    height: timeline.height,
                  }
                : {}),
            },
      ),
      direction,
    });

    moveSelectionByDelta(targetIndex - state.selectedTimelineIndex);
  };

  const render = (): void => {
    syncLayout();
    const palette = createRendererPalette({
      focus: state.focus,
      inputLocked: state.inputLocked,
    });

    timeline.style.fg = palette.timeline.text;
    timeline.style.bg = palette.timeline.bg;
    timeline.style.border.fg = palette.timeline.border;
    timeline.setLabel(` ${blessed.escape("Timeline")} `);
    composer.style.fg = palette.composer.text;
    composer.style.bg = palette.composer.bg;
    composer.style.border.fg = palette.composer.border;
    composer.setLabel(` ${blessed.escape("Composer")} `);
    commandMenu.style.fg = palette.commandMenu.text;
    commandMenu.style.bg = palette.commandMenu.bg;
    commandMenu.style.border.fg = palette.commandMenu.border;
    commandMenu.setLabel(` ${blessed.escape("Commands")} `);
    inspector.style.fg = palette.inspector.text;
    inspector.style.bg = palette.inspector.bg;
    inspector.style.border.fg = palette.inspector.border;
    statusBar.style.fg = palette.statusBar.fg;
    statusBar.style.bg = palette.statusBar.bg;

    const renderedTimeline = renderTimeline(state, palette, resolveCurrentTimelineWrapWidth());
    timeline.setContent(renderedTimeline.content);
    syncTimelineScroll(renderedTimeline.selectedLine);

    commandMenu.setContent(
      renderCommandMenuMarkup({
        ...state.commandMenu,
        palette,
      }),
    );
    inspector.setContent(renderInspector(state));
    const screenWidth =
      typeof screen.width === "number" ? screen.width : process.stdout.columns ?? 80;
    statusBar.setContent(
      truncateSingleLine(renderStatusBar(state), Math.max(1, screenWidth)),
    );
    composer.setContent(
      renderComposerMarkup({
        draft: localDraft,
        inputLocked: state.inputLocked,
        palette,
      }),
    );

    screen.render();

    const cursorPlacement = getComposerCursorPlacement({
      focus: state.focus,
      inputLocked: state.inputLocked,
      draft: localDraft,
      ...(composer.lpos !== undefined
        ? {
            composerBox: {
              xi: composer.lpos.xi,
              yi: composer.lpos.yi,
            },
          }
        : {}),
      paddingLeft: COMPOSER_PADDING_LEFT,
      paddingTop: COMPOSER_PADDING_TOP,
    });

    if (cursorPlacement.visible && cursorPlacement.x !== undefined && cursorPlacement.y !== undefined) {
      screen.program.showCursor();
      screen.program.cup(cursorPlacement.y, cursorPlacement.x);
    } else {
      screen.program.hideCursor();
    }
  };

  const updateDraft = (draft: string): void => {
    localDraft = draft;
    input.handlers.onDraftChange(draft);
    render();
  };

  screen.on("keypress", (character: string, key: BlessedKey) => {
    const result = interpretKeypress(
      {
        focus: state.focus,
        inputLocked: state.inputLocked,
        draft: localDraft,
      },
      character,
      key,
    );

    for (const action of result.actions) {
      switch (action) {
        case "exit":
          input.handlers.onExit();
          break;
        case "interrupt":
          input.handlers.onInterrupt();
          break;
        case "toggle_inspector":
          input.handlers.onToggleInspector();
          break;
        case "focus_timeline":
          input.handlers.onFocusTimeline();
          break;
        case "focus_composer":
          input.handlers.onFocusComposer();
          break;
        case "move_selection_up":
          input.handlers.onMoveSelectionUp();
          break;
        case "move_selection_down":
          input.handlers.onMoveSelectionDown();
          break;
        case "move_selection_page_up":
          moveSelectionByPage("up");
          break;
        case "move_selection_page_down":
          moveSelectionByPage("down");
          break;
        case "toggle_selected_item":
          input.handlers.onToggleSelectedItem();
          break;
      }
    }

    if (result.nextDraft !== undefined) {
      updateDraft(result.nextDraft);
    }

    if (result.submitPrompt !== undefined) {
      localDraft = "";
      input.handlers.onDraftChange("");
      input.handlers.onSubmit(result.submitPrompt);
    }
  });
  screen.on("resize", () => {
    render();
  });

  return {
    update(nextState) {
      state = nextState;
      localDraft = nextState.draft;
      render();
    },
    async start() {
      render();
    },
    async close() {
      if (closed) {
        return;
      }

      closed = true;
      screen.program.showCursor();
      screen.destroy();
    },
  };
}
