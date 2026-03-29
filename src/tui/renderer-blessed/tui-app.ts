import blessed from "neo-blessed";
import type { Widgets } from "blessed";

import type { InteractiveTuiApp, InteractiveTuiAppFactoryInput } from "../tui-app.ts";
import type { TuiState } from "../tui-types.ts";
import { buildTuiFooterView } from "../view-model/tui-view-model.ts";
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
import { getTimelineViewportLineCount } from "./tui-scroll.ts";

const STATUS_HEIGHT = 1;
const COMPOSER_HEIGHT = 7;
const INSPECTOR_WIDTH = 32;
const COMPOSER_PADDING_LEFT = 1;
const COMPOSER_PADDING_RIGHT = 1;
const COMPOSER_PADDING_TOP = 0;

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
  const footer = buildTuiFooterView(state);
  const timelineMode = state.timelineMode ?? "scroll";

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
    `Timeline ${timelineMode === "select" ? "Select Mode" : "Scroll Mode"}`,
    `Focus ${state.focus}`,
    `State ${footer.status.runtimeLabel}`,
    state.inputLocked ? "Composer locked" : "Composer ready",
  ].join("\n");
}

export function renderStatusBar(state: TuiState): string {
  const footer = buildTuiFooterView(state);
  const timelineMode = state.timelineMode ?? "scroll";
  const modeLabel = timelineMode === "select" ? "Select Mode" : "Scroll Mode";

  return [
    "beta",
    `${escapeTaggedText(state.providerLabel)}/${escapeTaggedText(state.modelLabel)}`,
    escapeTaggedText(state.projectLabel),
    escapeTaggedText(state.branchLabel),
    `Context ${state.contextMetrics.percent}%`,
    `${state.contextMetrics.rules} rules`,
    `${state.contextMetrics.hooks} hooks`,
    `${state.contextMetrics.docs} docs`,
    footer.status.runtimeLabel,
    modeLabel,
    "Enter send",
    "Ctrl+J newline",
    "Tab focus",
    "o inspector",
    "F2 mode",
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

function resolveComposerContentWidth(screenWidth: number): number {
  return Math.max(1, screenWidth - 2 - COMPOSER_PADDING_LEFT - COMPOSER_PADDING_RIGHT);
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
    mouse: true,
    scrollbar: {
      ch: " ",
    },
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

  let lastRenderedSelectionIndex: number | null = null;

  const timelineNode = timeline as unknown as {
    border?: unknown;
    padding?: {
      left?: number;
      right?: number;
    };
    lpos?: {
      xi: number;
      xl: number;
      yi: number;
      yl: number;
    };
    height?: number;
    scroll?: (offset: number) => void;
    scrollTo: (offset: number) => void;
    setScrollPerc: (value: number) => void;
    getScroll?: () => number;
    mouse?: boolean;
  };

  const getTimelineScrollOffset = (): number => {
    const current = timelineNode.getScroll?.();
    return typeof current === "number" && Number.isFinite(current) ? current : 0;
  };

  const restoreTimelineScrollOffset = (offset: number): void => {
    timelineNode.scrollTo(Math.max(0, offset));
  };

  const scrollTimelineByLines = (offset: number): void => {
    if ((state.timelineMode ?? "scroll") !== "scroll") {
      return;
    }

    if (typeof timelineNode.scroll === "function") {
      timelineNode.scroll(offset);
    } else {
      restoreTimelineScrollOffset(getTimelineScrollOffset() + offset);
    }

    screen.render();
  };

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
    const padding = timelineNode.padding;

    // Prefer exact box geometry when available (post-render), otherwise fall
    // back to known terminal width minus the inspector offset.
    const widthFromLpos = timelineNode.lpos !== undefined
      ? timelineNode.lpos.xl - timelineNode.lpos.xi + 1
      : undefined;
    const widthFromScreen =
      typeof screen.width === "number" ? screen.width - inspectorOffset : undefined;
    const widthFromStdout =
      typeof process.stdout.columns === "number"
        ? process.stdout.columns - inspectorOffset
        : undefined;

    const boxWidth = widthFromLpos ?? widthFromScreen ?? widthFromStdout;

    return resolveTimelineWrapWidth({
      border: Boolean(timelineNode.border),
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

  const scrollTimelineByPage = (direction: "up" | "down"): void => {
    const viewportLines = getTimelineViewportLineCount(
      timelineNode.lpos !== undefined
        ? {
            boxPosition: {
              yi: timelineNode.lpos.yi,
              yl: timelineNode.lpos.yl,
            },
          }
        : {
            ...(typeof timelineNode.height === "number"
              ? {
                  height: timelineNode.height,
                }
              : {}),
          },
    );
    const delta = direction === "up" ? -viewportLines : viewportLines;
    scrollTimelineByLines(delta);
  };

  const syncMouseMode = (): void => {
    const enableTimelineMouse = (state.timelineMode ?? "scroll") === "scroll";

    timelineNode.mouse = enableTimelineMouse;

    if (enableTimelineMouse) {
      screen.program.enableMouse?.();
      return;
    }

    screen.program.disableMouse?.();
  };

  const render = (): void => {
    syncLayout();
    syncMouseMode();
    const themePickerActive = state.themePicker !== null;
    const palette = createRendererPalette({
      focus: state.focus,
      inputLocked: state.inputLocked,
      themeId: state.themePicker?.selectedThemeId ?? state.activeThemeId,
    });

    timeline.style.fg = palette.timeline.text;
    timeline.style.bg = palette.timeline.bg;
    timeline.style.border.fg = palette.timeline.border;
    timeline.setLabel(` ${blessed.escape("Timeline")} `);
    composer.style.fg = palette.composer.text;
    composer.style.bg = palette.composer.bg;
    composer.style.border.fg = palette.composer.border;
    composer.setLabel(` ${blessed.escape(state.themePicker ? "Theme Picker" : "Composer")} `);
    commandMenu.style.fg = palette.commandMenu.text;
    commandMenu.style.bg = palette.commandMenu.bg;
    commandMenu.style.border.fg = palette.commandMenu.border;
    commandMenu.setLabel(` ${blessed.escape("Commands")} `);
    inspector.style.fg = palette.inspector.text;
    inspector.style.bg = palette.inspector.bg;
    inspector.style.border.fg = palette.inspector.border;
    statusBar.style.fg = palette.statusBar.fg;
    statusBar.style.bg = palette.statusBar.bg;

    const currentScrollOffset = getTimelineScrollOffset();
    const renderedTimeline = renderTimeline(state, palette, resolveCurrentTimelineWrapWidth());
    timeline.setContent(renderedTimeline.content);
    const shouldSyncSelection =
      (state.timelineMode ?? "scroll") === "scroll" &&
      lastRenderedSelectionIndex !== state.selectedTimelineIndex;

    if (shouldSyncSelection) {
      syncTimelineScroll(renderedTimeline.selectedLine);
    } else {
      restoreTimelineScrollOffset(currentScrollOffset);
    }
    lastRenderedSelectionIndex = state.selectedTimelineIndex;

    commandMenu.setContent(
      renderCommandMenuMarkup({
        ...state.commandMenu,
        palette,
      }),
    );
    inspector.setContent(renderInspector(state));
    const screenWidth =
      typeof screen.width === "number" ? screen.width : process.stdout.columns ?? 80;
    const composerContentWidth = resolveComposerContentWidth(screenWidth);
    statusBar.setContent(
      truncateSingleLine(renderStatusBar(state), Math.max(1, screenWidth)),
    );
    const composerLocked = state.inputLocked || themePickerActive;
    const composerDraft = themePickerActive
      ? "Use ↑↓ to move\nEnter apply"
      : localDraft;
    composer.setContent(
      renderComposerMarkup({
        draft: composerDraft,
        inputLocked: composerLocked,
        palette,
        maxLineWidth: composerContentWidth,
      }),
    );

    screen.render();

    const cursorPlacement = getComposerCursorPlacement({
      focus: state.focus,
      inputLocked: composerLocked,
      draft: composerDraft,
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
      maxLineWidth: composerContentWidth,
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
        themePickerActive: state.themePicker !== null,
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
        case "toggle_timeline_mode":
          input.handlers.onToggleTimelineMode();
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
          scrollTimelineByPage("up");
          break;
        case "move_selection_page_down":
          scrollTimelineByPage("down");
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
  timeline.on("wheelup", () => {
    scrollTimelineByLines(-3);
  });
  timeline.on("wheeldown", () => {
    scrollTimelineByLines(3);
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
