import { stdin as processStdin, stdout as processStdout } from "node:process";

import { buildTuiViewModel } from "../view-model/tui-view-model.ts";
import {
  type InteractiveTuiApp,
  type InteractiveTuiAppFactoryInput,
  type TerminalTuiInput,
  type TerminalTuiOutput,
} from "../tui-app.ts";
import type { TuiState } from "../tui-types.ts";
import { createAnsiWriter } from "./ansi-writer.ts";
import { renderFooter, type RenderedFooter } from "./footer-renderer.ts";
import { handleTerminalInputChunk } from "./input-driver.ts";
import { createTerminalSession } from "./terminal-session.ts";
import { padOrTrimToWidth, wrapPlainText } from "./text-layout.ts";
import { diffTranscriptLines, renderTranscriptLayout, renderTranscriptLines } from "./transcript-renderer.ts";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const TRANSCRIPT_HEADER_HEIGHT = 1;
const COMPOSER_BODY_HEIGHT = 3;

type ScreenLayout = {
  width: number;
  rows: number;
  transcriptHeaderLine: string;
  transcriptTopRow: number;
  transcriptHeight: number;
  transcriptBottomRow: number;
  footerTopRow: number;
  transcriptLines: string[];
  footer: RenderedFooter;
};

function resolveTerminalOutput(input: InteractiveTuiAppFactoryInput): TerminalTuiOutput {
  return input.terminal?.stdout ?? (processStdout as unknown as TerminalTuiOutput);
}

function resolveTerminalInput(input: InteractiveTuiAppFactoryInput): TerminalTuiInput {
  return input.terminal?.stdin ?? (processStdin as unknown as TerminalTuiInput);
}

function resolveWrite(
  input: InteractiveTuiAppFactoryInput,
  stdout: TerminalTuiOutput,
): (chunk: string) => void {
  if (input.terminal?.write) {
    return input.terminal.write;
  }

  return (chunk) => {
    stdout.write(chunk);
  };
}

function normalizeColumns(stdout: TerminalTuiOutput): number {
  if (typeof stdout.columns === "number" && Number.isFinite(stdout.columns) && stdout.columns > 0) {
    return Math.floor(stdout.columns);
  }

  return DEFAULT_COLUMNS;
}

function normalizeRows(stdout: TerminalTuiOutput): number {
  if (typeof stdout.rows === "number" && Number.isFinite(stdout.rows) && stdout.rows > 0) {
    return Math.floor(stdout.rows);
  }

  return DEFAULT_ROWS;
}

function renderPanelHeader(width: number, label: string): string {
  if (width <= 0) {
    return "";
  }

  if (width === 1) {
    return "─";
  }

  const innerWidth = Math.max(0, width - 2);
  const visibleLabel = label.slice(0, innerWidth);
  const fillerWidth = Math.max(0, innerWidth - visibleLabel.length);

  return `╶${visibleLabel}${"─".repeat(fillerWidth)}╴`;
}

function computeComposerCursor(
  state: TuiState,
  width: number,
  visibleHeight: number,
): { rowOffset: number; column: number } {
  const lines = state.draft.length === 0 ? [""] : wrapPlainText(state.draft, width);
  const visible = lines.slice(-visibleHeight);
  const rowOffset = Math.max(0, visible.length - 1);
  const lastLine = visible.at(-1) ?? "";

  return {
    rowOffset,
    column: Math.min(width, Array.from(lastLine).length + 1),
  };
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((line, index) => line === right[index]);
}

function buildScreenLayout(state: TuiState, stdout: TerminalTuiOutput): ScreenLayout {
  const width = normalizeColumns(stdout);
  const rows = normalizeRows(stdout);
  const view = buildTuiViewModel(state);
  const footer = renderFooter(view.footer, {
    width,
    composerHeight: COMPOSER_BODY_HEIGHT,
  });
  const footerLines = footer.lines.map((line) => padOrTrimToWidth(line, width));
  const transcriptTopRow = TRANSCRIPT_HEADER_HEIGHT + 1;
  const transcriptHeight = Math.max(0, rows - TRANSCRIPT_HEADER_HEIGHT - footerLines.length);
  const transcriptBottomRow = transcriptHeight > 0
    ? transcriptTopRow + transcriptHeight - 1
    : transcriptTopRow - 1;
  const footerTopRow = transcriptTopRow + transcriptHeight;

  return {
    width,
    rows,
    transcriptHeaderLine: renderPanelHeader(width, " Timeline "),
    transcriptTopRow,
    transcriptHeight,
    transcriptBottomRow,
    footerTopRow,
    transcriptLines: renderTranscriptLines(view.transcript, width).map((line) => padOrTrimToWidth(line, width)),
    footer: {
      ...footer,
      lines: footerLines,
    },
  };
}

function createEmptyLine(width: number): string {
  return " ".repeat(Math.max(0, width));
}

function findPageSelectionIndex(input: {
  itemStartLines: number[];
  selectedIndex: number;
  viewportLines: number;
  direction: "up" | "down";
}): number {
  if (input.itemStartLines.length === 0) {
    return 0;
  }

  const selectedIndex = Math.max(0, Math.min(input.selectedIndex, input.itemStartLines.length - 1));
  const currentLine = input.itemStartLines[selectedIndex] ?? 0;
  const pageSpan = Math.max(1, input.viewportLines - 1);

  if (input.direction === "down") {
    const targetLine = currentLine + pageSpan;

    for (let index = selectedIndex + 1; index < input.itemStartLines.length; index += 1) {
      if ((input.itemStartLines[index] ?? 0) >= targetLine) {
        return index;
      }
    }

    return input.itemStartLines.length - 1;
  }

  const targetLine = currentLine - pageSpan;

  for (let index = selectedIndex - 1; index >= 0; index -= 1) {
    if ((input.itemStartLines[index] ?? 0) <= targetLine) {
      return index;
    }
  }

  return 0;
}

export function createTerminalTuiApp(
  input: InteractiveTuiAppFactoryInput,
): InteractiveTuiApp {
  const stdin = resolveTerminalInput(input);
  const stdout = resolveTerminalOutput(input);
  const write = resolveWrite(input, stdout);
  const writer = createAnsiWriter(write);
  const session = createTerminalSession({
    writer,
    setRawMode: (enabled) => {
      stdin.setRawMode?.(enabled);
    },
  });

  let state = input.initialState;
  let started = false;
  let renderedLayout: ScreenLayout | null = null;
  let renderedTranscriptLines: string[] = [];
  let transcriptRowsUsed = 0;

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
    const width = normalizeColumns(stdout);
    const rows = normalizeRows(stdout);
    const view = buildTuiViewModel(state);
    const footer = renderFooter(view.footer, {
      width,
      composerHeight: COMPOSER_BODY_HEIGHT,
    });
    const transcriptHeight = Math.max(0, rows - TRANSCRIPT_HEADER_HEIGHT - footer.lines.length);

    if (transcriptHeight <= 0) {
      return;
    }

    const renderedTranscript = renderTranscriptLayout(view.transcript, {
      width,
      height: transcriptHeight,
    });
    const targetIndex = findPageSelectionIndex({
      itemStartLines: renderedTranscript.itemStartLines,
      selectedIndex: state.selectedTimelineIndex,
      viewportLines: transcriptHeight,
      direction,
    });

    moveSelectionByDelta(targetIndex - state.selectedTimelineIndex);
  };

  const setCursor = (layout: ScreenLayout): void => {
    if (!state.inputLocked && state.focus === "composer") {
      const cursor = computeComposerCursor(
        state,
        layout.footer.composerContentWidth,
        layout.footer.composerBodyHeight,
      );
      writer.moveCursor(
        layout.footer.composerContentColumn + cursor.column - 1,
        layout.footerTopRow + layout.footer.composerBodyTop + cursor.rowOffset,
      );
      writer.showCursor();
      return;
    }

    writer.hideCursor();
  };

  const renderFooterAtBottom = (layout: ScreenLayout): void => {
    for (const [index, line] of layout.footer.lines.entries()) {
      writer.moveCursor(1, layout.footerTopRow + index);
      write(line);
    }
  };

  const clearTranscriptRegion = (layout: ScreenLayout): void => {
    if (layout.transcriptHeight <= 0) {
      return;
    }

    for (let row = layout.transcriptTopRow; row <= layout.transcriptBottomRow; row += 1) {
      writer.moveCursor(1, row);
      write(createEmptyLine(layout.width));
    }
  };

  const appendTranscriptLine = (layout: ScreenLayout, line: string): void => {
    if (layout.transcriptHeight <= 0) {
      return;
    }

    if (transcriptRowsUsed < layout.transcriptHeight) {
      writer.moveCursor(1, layout.transcriptTopRow + transcriptRowsUsed);
      write(line);
      transcriptRowsUsed += 1;
      return;
    }

    writer.moveCursor(1, layout.transcriptBottomRow);
    write("\n");
    writer.moveCursor(1, layout.transcriptBottomRow);
    write(line);
  };

  const replayTranscript = (layout: ScreenLayout): void => {
    clearTranscriptRegion(layout);
    transcriptRowsUsed = 0;

    const visibleLines =
      layout.transcriptLines.length <= layout.transcriptHeight
        ? layout.transcriptLines
        : layout.transcriptLines.slice(-layout.transcriptHeight);

    for (const line of visibleLines) {
      appendTranscriptLine(layout, line);
    }
  };

  const startMainScreen = (layout: ScreenLayout): void => {
    writer.clearScreen();
    writer.moveCursor(1, 1);
    write(layout.transcriptHeaderLine);

    if (layout.transcriptHeight > 0) {
      writer.setScrollRegion(layout.transcriptTopRow, layout.transcriptBottomRow);
    } else {
      writer.resetScrollRegion();
    }

    replayTranscript(layout);
    renderFooterAtBottom(layout);
    setCursor(layout);
  };

  const updateScreen = (): void => {
    const nextLayout = buildScreenLayout(state, stdout);

    if (!started) {
      return;
    }

    if (
      renderedLayout === null ||
      renderedLayout.width !== nextLayout.width ||
      renderedLayout.rows !== nextLayout.rows
    ) {
      startMainScreen(nextLayout);
      renderedLayout = nextLayout;
      renderedTranscriptLines = nextLayout.transcriptLines;
      return;
    }

    const transcriptDiff = diffTranscriptLines(renderedTranscriptLines, nextLayout.transcriptLines);

    if (transcriptDiff.mode === "append") {
      for (const line of transcriptDiff.lines) {
        appendTranscriptLine(nextLayout, line);
      }
    } else {
      replayTranscript(nextLayout);
    }

    if (!arraysEqual(renderedLayout.footer.lines, nextLayout.footer.lines)) {
      renderFooterAtBottom(nextLayout);
    } else {
      // Cursor state may still need updating even when footer text is unchanged.
      renderFooterAtBottom(nextLayout);
    }

    setCursor(nextLayout);
    renderedLayout = nextLayout;
    renderedTranscriptLines = nextLayout.transcriptLines;
  };

  const onData = (chunk: string | Buffer | Uint8Array): void => {
    handleTerminalInputChunk(chunk, state, {
      onDraftChange: input.handlers.onDraftChange,
      onSubmit: input.handlers.onSubmit,
      onInterrupt: input.handlers.onInterrupt,
      onToggleInspector: input.handlers.onToggleInspector,
      onFocusTimeline: input.handlers.onFocusTimeline,
      onFocusComposer: input.handlers.onFocusComposer,
      onMoveSelectionUp: input.handlers.onMoveSelectionUp,
      onMoveSelectionDown: input.handlers.onMoveSelectionDown,
      onMoveSelectionPageUp: () => {
        moveSelectionByPage("up");
      },
      onMoveSelectionPageDown: () => {
        moveSelectionByPage("down");
      },
      onToggleSelectedItem: input.handlers.onToggleSelectedItem,
      onExit: input.handlers.onExit,
    });
  };

  const onResize = (): void => {
    if (started) {
      updateScreen();
    }
  };

  return {
    update(nextState: TuiState): void {
      state = nextState;

      if (started) {
        updateScreen();
      }
    },
    async start(): Promise<void> {
      if (started) {
        return;
      }

      started = true;
      session.enter();
      stdin.on("data", onData);
      stdout.on?.("resize", onResize);
      updateScreen();
    },
    async close(): Promise<void> {
      if (!started) {
        return;
      }

      started = false;
      if (stdin.off) {
        stdin.off("data", onData);
      } else {
        stdin.removeListener?.("data", onData);
      }
      if (stdout.off) {
        stdout.off("resize", onResize);
      } else {
        stdout.removeListener?.("resize", onResize);
      }
      session.exit();
    },
  };
}
