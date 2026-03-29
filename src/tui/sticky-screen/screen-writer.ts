import type { AnsiWriter } from "../renderer-terminal/ansi-writer.ts";
import { renderFooter } from "../renderer-terminal/footer-renderer.ts";
import { textDisplayWidth, wrapPlainText } from "../renderer-terminal/text-layout.ts";
import type { TuiFooterView } from "../view-model/tui-view-types.ts";

export type ComposerSnapshot = {
  text: string;
  cursorOffset: number;
  locked: boolean;
  hidden: boolean;
  placeholder: string;
  statusLabel: string;
  theme?: TuiFooterView["theme"];
  themePicker?: TuiFooterView["themePicker"];
};

export type ActiveStatusSnapshot =
  | {
      kind: "thinking" | "streaming" | "executing" | "interrupting" | "error";
      text: string;
      requestId?: string;
      executionId?: string;
      spinnerFrame?: string;
    }
  | null;

export type StickyLayout = {
  rows: number;
  cols: number;
  reservedHeight: number;
  scrollBottom: number;
  footerTopRow: number;
  footerRows: number;
};

type TimerHandle = unknown;

export type ScreenWriterOptions = {
  writer: AnsiWriter;
  write: (chunk: string) => void;
  getTerminalSize: () => { rows: number; cols: number };
  reservedHeight: number;
  resizeDebounceMs?: number;
  onResizeSettled?: () => void;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
};

export type ScreenWriter = {
  enterStickyMode: () => void;
  exitStickyMode: () => void;
  writeTimelineChunk: (text: string) => void;
  replaceTimeline: (text: string) => void;
  replaceFixedTimeline: (lines: string[], previousLines?: string[]) => void;
  setActiveStatus: (snapshot: ActiveStatusSnapshot) => void;
  clearActiveStatus: () => void;
  renderComposer: (snapshot: ComposerSnapshot) => void;
  scheduleResize: () => void;
  suspendForPager: () => void;
  resumeFromPager: () => void;
  fatalCleanup: () => void;
};

function defaultSetTimer(callback: () => void, delayMs: number): TimerHandle {
  return setTimeout(callback, delayMs);
}

function defaultClearTimer(handle: TimerHandle): void {
  clearTimeout(handle as NodeJS.Timeout);
}

function computeLayout(
  rows: number,
  cols: number,
  reservedHeight: number,
): { isDegradedMode: boolean; layout: StickyLayout | null } {
  if (rows <= reservedHeight + 2) {
    return {
      isDegradedMode: true,
      layout: null,
    };
  }

  const scrollBottom = rows - reservedHeight;

  return {
    isDegradedMode: false,
    layout: {
      rows,
      cols,
      reservedHeight,
      scrollBottom,
      footerTopRow: scrollBottom + 1,
      footerRows: reservedHeight,
    },
  };
}

function normalizeComposerText(text: string): string {
  return text.replaceAll("\r\n", "\n");
}

function toWrappedLines(text: string, width: number): string[] {
  const wrapped = wrapPlainText(text, width);
  return wrapped.length > 0 ? wrapped : [""];
}

function splitComposerLines(
  snapshot: ComposerSnapshot,
  maxRows: number,
  width: number,
): string[] {
  const visibleText = snapshot.text.length > 0 ? snapshot.text : snapshot.placeholder;
  const wrappedLines = toWrappedLines(normalizeComposerText(visibleText), width);

  if (wrappedLines.length >= maxRows) {
    return wrappedLines.slice(-maxRows);
  }

  return [...wrappedLines, ...Array.from({ length: maxRows - wrappedLines.length }, () => "")];
}

function computeComposerCursor(
  snapshot: ComposerSnapshot,
  maxRows: number,
  width: number,
): { rowOffset: number; column: number } {
  const characters = Array.from(normalizeComposerText(snapshot.text));
  const clampedOffset = Math.max(0, Math.min(snapshot.cursorOffset, characters.length));
  const prefix = characters.slice(0, clampedOffset).join("");
  const wrappedPrefix = toWrappedLines(prefix, width);
  const visiblePrefix = wrappedPrefix.slice(-maxRows);
  const rowOffset = Math.max(0, visiblePrefix.length - 1);
  const lastLine = visiblePrefix.at(-1) ?? "";

  return {
    rowOffset,
    column: textDisplayWidth(lastLine) + 1,
  };
}

export function createScreenWriter(options: ScreenWriterOptions): ScreenWriter {
  const setTimer = options.setTimer ?? defaultSetTimer;
  const clearTimer = options.clearTimer ?? defaultClearTimer;
  const resizeDebounceMs = options.resizeDebounceMs ?? 75;

  let stickyActive = false;
  let pagerSuspended = false;
  let cleanedUp = false;
  let resizeTimer: TimerHandle | null = null;
  let activeStatusSnapshot: ActiveStatusSnapshot = null;
  let composerSnapshot: ComposerSnapshot = {
    text: "",
    cursorOffset: 0,
    locked: false,
    hidden: false,
    placeholder: "",
    statusLabel: "Done",
  };

  const resolveLayout = () => {
    const terminalSize = options.getTerminalSize();
    return computeLayout(
      terminalSize.rows,
      terminalSize.cols,
      options.reservedHeight,
    );
  };

  const redrawFooter = (): void => {
    const { isDegradedMode, layout } = resolveLayout();

    if (
      !stickyActive ||
      pagerSuspended ||
      isDegradedMode ||
      layout === null
    ) {
      return;
    }

    const composerValue =
      composerSnapshot.text.length > 0 ? composerSnapshot.text : composerSnapshot.placeholder;
    const footer = renderFooter(
      {
        ...(composerSnapshot.theme ? { theme: composerSnapshot.theme } : {}),
        composer: {
          value: composerValue,
          locked: composerSnapshot.locked,
        },
        status: {
          runtimeLabel: activeStatusSnapshot?.text ?? composerSnapshot.statusLabel,
        },
        ...(composerSnapshot.themePicker ? { themePicker: composerSnapshot.themePicker } : {}),
      },
      {
        width: layout.cols,
        composerHeight: Math.max(1, layout.footerRows - 2),
      },
    );

    options.writer.saveCursor();
    options.writer.disableLineWrap();

    let footerHidden = false;

    try {
      if (composerSnapshot.hidden) {
        footerHidden = true;
        for (let row = layout.footerTopRow; row <= layout.rows; row += 1) {
          options.writer.moveCursor(1, row);
          options.writer.clearLine();
        }
      } else {
        for (let index = 0; index < footer.lines.length; index += 1) {
          options.writer.moveCursor(1, layout.footerTopRow + index);
          options.writer.clearLine();
          options.write(footer.lines[index] ?? "");
        }
      }
    } finally {
      options.writer.enableLineWrap();
      options.writer.restoreCursor();
    }

    if (footerHidden || composerSnapshot.locked) {
      options.writer.hideCursor();
      return;
    }

    const cursor = computeComposerCursor(
      composerSnapshot,
      footer.composerBodyHeight,
      footer.composerContentWidth,
    );
    options.writer.moveCursor(
      footer.composerContentColumn + cursor.column - 1,
      layout.footerTopRow + footer.composerBodyTop + cursor.rowOffset,
    );
    options.writer.showCursor();
  };

  const enterStickyMode = (): void => {
    cleanedUp = false;
    options.writer.resetScrollRegion();
    options.write("\n".repeat(options.reservedHeight));

    const { isDegradedMode, layout } = resolveLayout();

    stickyActive = true;

    if (isDegradedMode || layout === null) {
      return;
    }

    options.writer.setScrollRegion(1, layout.scrollBottom);
    options.writer.hideCursor();
    redrawFooter();
  };

  return {
    enterStickyMode,
    exitStickyMode: () => {
      const { isDegradedMode, layout } = resolveLayout();

      if (
        stickyActive &&
        !pagerSuspended &&
        !isDegradedMode &&
        layout !== null
      ) {
        for (let row = layout.footerTopRow; row <= layout.rows; row += 1) {
          options.writer.moveCursor(1, row);
          options.writer.clearLine();
        }
        options.writer.moveCursor(1, layout.footerTopRow);
      }

      stickyActive = false;
      pagerSuspended = false;
      options.writer.resetScrollRegion();
      options.writer.showCursor();
    },
    writeTimelineChunk: (text: string) => {
      const { isDegradedMode, layout } = resolveLayout();

      if (
        stickyActive &&
        !pagerSuspended &&
        !isDegradedMode &&
        layout !== null
      ) {
        options.writer.saveCursor();
        options.writer.moveCursor(1, layout.scrollBottom);
        options.writer.disableLineWrap();
        try {
          options.write(text);
        } finally {
          options.writer.enableLineWrap();
          options.writer.restoreCursor();
        }
        return;
      }

      options.write(text);
    },
    replaceTimeline: (text: string) => {
      const { isDegradedMode, layout } = resolveLayout();

      if (
        stickyActive &&
        !pagerSuspended &&
        !isDegradedMode &&
        layout !== null
      ) {
        options.writer.saveCursor();
        options.writer.disableLineWrap();
        try {
          for (let row = 1; row <= layout.scrollBottom; row += 1) {
            options.writer.moveCursor(1, row);
            options.writer.clearLine();
          }
          options.writer.moveCursor(1, 1);
          options.write(text);
        } finally {
          options.writer.enableLineWrap();
          options.writer.restoreCursor();
        }
        return;
      }

      options.write(text);
    },
    replaceFixedTimeline: (lines: string[], previousLines: string[] = []) => {
      const { isDegradedMode, layout } = resolveLayout();

      if (
        stickyActive &&
        !pagerSuspended &&
        !isDegradedMode &&
        layout !== null
      ) {
        options.writer.resetScrollRegion();
        options.writer.saveCursor();
        options.writer.disableLineWrap();
        try {
          const maxRows = Math.min(
            layout.scrollBottom,
            Math.max(lines.length, previousLines.length),
          );

          for (let row = 1; row <= maxRows; row += 1) {
            const nextLine = lines[row - 1] ?? null;
            const previousLine = previousLines[row - 1] ?? null;

            if (nextLine === previousLine) {
              continue;
            }

            options.writer.moveCursor(1, row);
            options.writer.clearLine();

            if (nextLine !== null) {
              options.write(nextLine);
            }
          }
        } finally {
          options.writer.enableLineWrap();
          options.writer.restoreCursor();
          options.writer.setScrollRegion(1, layout.scrollBottom);
        }
        return;
      }

      options.write(lines.join("\n"));
    },
    setActiveStatus: (snapshot) => {
      activeStatusSnapshot = snapshot;
      redrawFooter();
    },
    clearActiveStatus: () => {
      activeStatusSnapshot = null;
      redrawFooter();
    },
    renderComposer: (snapshot) => {
      composerSnapshot = snapshot;
      redrawFooter();
    },
    scheduleResize: () => {
      if (resizeTimer !== null) {
        clearTimer(resizeTimer);
      }

      resizeTimer = setTimer(() => {
        resizeTimer = null;
        options.onResizeSettled?.();
      }, resizeDebounceMs);
    },
    suspendForPager: () => {
      pagerSuspended = true;
      stickyActive = false;
      options.writer.resetScrollRegion();
      options.writer.showCursor();
    },
    resumeFromPager: () => {
      pagerSuspended = false;
      enterStickyMode();
    },
    fatalCleanup: () => {
      if (cleanedUp) {
        return;
      }

      cleanedUp = true;
      stickyActive = false;
      pagerSuspended = false;
      options.writer.resetScrollRegion();
      options.writer.showCursor();
    },
  };
}
