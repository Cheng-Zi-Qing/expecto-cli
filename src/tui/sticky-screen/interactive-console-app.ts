import { stdin as processStdin, stdout as processStdout } from "node:process";

import {
  createAnsiWriter,
} from "../renderer-terminal/ansi-writer.ts";
import { handleTerminalInputChunk } from "../renderer-terminal/input-driver.ts";
import {
  createTerminalSession,
  type TerminalSession,
} from "../renderer-terminal/terminal-session.ts";
import { diffTranscriptLines } from "../renderer-terminal/transcript-renderer.ts";
import type {
  InteractiveTuiApp,
  InteractiveTuiAppFactoryInput,
  TerminalTuiInput,
  TerminalTuiOutput,
} from "../tui-app.ts";
import type { TuiState } from "../tui-types.ts";
import {
  createScreenWriter,
  type ScreenWriter,
} from "./screen-writer.ts";
import { projectStickyScreenState } from "./presentation-surface.ts";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const RESERVED_HEIGHT = 4;

export type InteractiveConsoleAppDependencies = {
  screenWriter?: ScreenWriter;
  terminalSession?: TerminalSession;
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

function appendTimelineLines(screenWriter: ScreenWriter, lines: string[]): void {
  if (lines.length === 0) {
    return;
  }

  screenWriter.writeTimelineChunk(`${lines.join("\n")}\n`);
}

function normalizeInputChunk(chunk: string | Buffer | Uint8Array): string {
  if (typeof chunk === "string") {
    return chunk;
  }

  return Buffer.from(chunk).toString("utf8");
}

function parseLocalInspectExecutionId(prompt: string): string | null {
  const match = /^\/inspect\s+([^\s]+)\s*$/u.exec(prompt.trim());
  return match?.[1] ?? null;
}

export function createInteractiveConsoleApp(
  input: InteractiveTuiAppFactoryInput,
  dependencies: InteractiveConsoleAppDependencies = {},
): InteractiveTuiApp {
  const stdin = resolveTerminalInput(input);
  const stdout = resolveTerminalOutput(input);
  const write = resolveWrite(input, stdout);
  const writer = createAnsiWriter(write);

  let state = input.initialState;
  let started = false;
  let renderedTranscriptLines: string[] = [];
  let transcriptSurfaceWasReplaced = false;
  let startedWithWelcomeOnly =
    state.timeline.length === 1 && state.timeline[0]?.kind === "welcome";
  let idleInterruptArmed = false;
  let lineFeedSubmits: boolean | null = null;

  const onResizeSettled = (): void => {
    if (!started) {
      return;
    }

    flushTranscriptProjection(true);
    renderStickyRegion();
  };

  const screenWriter = dependencies.screenWriter ?? createScreenWriter({
    writer,
    write,
    getTerminalSize: () => ({
      rows: normalizeRows(stdout),
      cols: normalizeColumns(stdout),
    }),
    reservedHeight: RESERVED_HEIGHT,
    onResizeSettled,
  });

  const renderStickyRegion = (): void => {
    const projection = projectStickyScreenState(state, normalizeColumns(stdout));

    if (projection.activeStatus === null) {
      screenWriter.clearActiveStatus();
    } else {
      screenWriter.setActiveStatus(projection.activeStatus);
    }

    screenWriter.renderComposer(projection.composer);
  };

  const primeStickyProjection = (): void => {
    const projection = projectStickyScreenState(state, normalizeColumns(stdout));

    if (projection.activeStatus === null) {
      screenWriter.clearActiveStatus();
    } else {
      screenWriter.setActiveStatus(projection.activeStatus);
    }

    screenWriter.renderComposer(projection.composer);
  };

  const terminalSession = dependencies.terminalSession ?? createTerminalSession({
    writer,
    setRawMode: (enabled) => {
      stdin.setRawMode?.(enabled);
    },
  });

  const submitPrompt = (prompt: string): void => {
    const inspectExecutionId = parseLocalInspectExecutionId(prompt);

    if (
      inspectExecutionId !== null &&
      typeof input.handlers.onInspectExecution === "function"
    ) {
      input.handlers.onDraftChange("");
      input.handlers.onInspectExecution(inspectExecutionId);
      return;
    }

    input.handlers.onSubmit(prompt);
  };

  const flushTranscriptProjection = (forceReplay = false): void => {
    const projection = projectStickyScreenState(state, normalizeColumns(stdout));
    const nextLines = projection.transcriptLines;

    if (renderedTranscriptLines.length === 0) {
      if (state.themePicker !== null) {
        screenWriter.replaceFixedTimeline(nextLines, renderedTranscriptLines);
        transcriptSurfaceWasReplaced = true;
      } else {
        appendTimelineLines(screenWriter, nextLines);
        transcriptSurfaceWasReplaced = false;
      }
      renderedTranscriptLines = nextLines;
      return;
    }

    const diff = diffTranscriptLines(renderedTranscriptLines, nextLines);

    if (diff.mode === "append") {
      appendTimelineLines(screenWriter, diff.lines);
      renderedTranscriptLines = nextLines;
      transcriptSurfaceWasReplaced = false;
      if (!(state.timeline.length === 1 && state.timeline[0]?.kind === "welcome")) {
        startedWithWelcomeOnly = false;
      }
      return;
    }

    if (forceReplay) {
      if (state.themePicker !== null) {
        screenWriter.replaceFixedTimeline(nextLines, renderedTranscriptLines);
      } else {
        screenWriter.replaceTimeline(nextLines.join("\n"));
      }
      renderedTranscriptLines = nextLines;
      transcriptSurfaceWasReplaced = state.themePicker !== null;
      if (!(state.timeline.length === 1 && state.timeline[0]?.kind === "welcome")) {
        startedWithWelcomeOnly = false;
      }
      return;
    }

    if (state.themePicker !== null || transcriptSurfaceWasReplaced) {
      if (state.themePicker !== null) {
        screenWriter.replaceFixedTimeline(nextLines, renderedTranscriptLines);
      } else {
        screenWriter.replaceTimeline(nextLines.join("\n"));
      }
      renderedTranscriptLines = nextLines;
      transcriptSurfaceWasReplaced = state.themePicker !== null;
      if (!(state.timeline.length === 1 && state.timeline[0]?.kind === "welcome")) {
        startedWithWelcomeOnly = false;
      }
      return;
    }

    if (startedWithWelcomeOnly && !(state.timeline.length === 1 && state.timeline[0]?.kind === "welcome")) {
      appendTimelineLines(screenWriter, nextLines);
      renderedTranscriptLines = nextLines;
      transcriptSurfaceWasReplaced = false;
      startedWithWelcomeOnly = false;
    }
  };

  const onData = (chunk: string | Buffer | Uint8Array): void => {
    const normalizedChunk = normalizeInputChunk(chunk);

    if (!state.inputLocked && normalizedChunk === "\u0003") {
      if (idleInterruptArmed) {
        idleInterruptArmed = false;
        input.handlers.onExit();
        return;
      }

      idleInterruptArmed = true;
      return;
    }

    if (normalizedChunk.length > 0) {
      idleInterruptArmed = false;
    }

    if (normalizedChunk === "\r") {
      lineFeedSubmits = false;
    } else if (!state.inputLocked && state.themePicker === null && normalizedChunk === "\n") {
      if (lineFeedSubmits !== false) {
        lineFeedSubmits = true;
        submitPrompt(state.draft);
        return;
      }
    }

    handleTerminalInputChunk(chunk, {
      draft: state.draft,
      inputLocked: state.inputLocked,
      themePickerActive: state.themePicker !== null,
    }, {
      onDraftChange: input.handlers.onDraftChange,
      onSubmit: submitPrompt,
      onInterrupt: input.handlers.onInterrupt,
      onExit: input.handlers.onExit,
      onMoveSelectionUp: input.handlers.onMoveSelectionUp,
      onMoveSelectionDown: input.handlers.onMoveSelectionDown,
      onToggleSelectedItem: input.handlers.onToggleSelectedItem,
    });
  };

  const onResize = (): void => {
    screenWriter.scheduleResize();
  };

  return {
    update(nextState: TuiState): void {
      state = nextState;

      if (!started) {
        return;
      }

      flushTranscriptProjection();
      renderStickyRegion();
    },
    async start(): Promise<void> {
      if (started) {
        return;
      }

      started = true;
      primeStickyProjection();
      terminalSession.enter();
      screenWriter.enterStickyMode();
      flushTranscriptProjection();
      renderStickyRegion();
      stdin.on("data", onData);
      stdout.on?.("resize", onResize);
    },
    async suspendForPager(): Promise<void> {
      screenWriter.suspendForPager();
    },
    async resumeFromPager(): Promise<void> {
      screenWriter.resumeFromPager();
      if (started) {
        renderStickyRegion();
      }
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
      stdin.pause?.();
      if (stdout.off) {
        stdout.off("resize", onResize);
      } else {
        stdout.removeListener?.("resize", onResize);
      }
      screenWriter.exitStickyMode();
      terminalSession.exit();
    },
  };
}
