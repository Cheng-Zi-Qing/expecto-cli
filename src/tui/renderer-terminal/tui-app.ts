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
import { renderFooter } from "./footer-renderer.ts";
import { handleTerminalInputChunk } from "./input-driver.ts";
import { createTerminalSession } from "./terminal-session.ts";
import { padOrTrimToWidth, wrapPlainText } from "./text-layout.ts";
import { renderTranscript } from "./transcript-renderer.ts";

const DEFAULT_COLUMNS = 80;
const DEFAULT_ROWS = 24;
const COMPOSER_HEIGHT = 3;

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

function computeComposerCursor(state: TuiState, width: number): { rowOffset: number; column: number } {
  const lines = state.draft.length === 0 ? [""] : wrapPlainText(state.draft, width);
  const visible = lines.slice(-COMPOSER_HEIGHT);
  const rowOffset = Math.max(0, visible.length - 1);
  const lastLine = visible.at(-1) ?? "";

  return {
    rowOffset,
    column: Math.min(width, Array.from(lastLine).length + 1),
  };
}

function renderScreen(state: TuiState, stdout: TerminalTuiOutput, write: (chunk: string) => void): void {
  const width = normalizeColumns(stdout);
  const rows = normalizeRows(stdout);
  const view = buildTuiViewModel(state);
  const footerLines = renderFooter(view.footer, {
    width,
    composerHeight: COMPOSER_HEIGHT,
  });
  const transcriptHeight = Math.max(0, rows - footerLines.length);
  const transcriptLines = renderTranscript(view.transcript, {
    width,
    height: transcriptHeight,
  }).map((line) => padOrTrimToWidth(line, width));

  const filledTranscript = [...transcriptLines];
  while (filledTranscript.length < transcriptHeight) {
    filledTranscript.push(" ".repeat(width));
  }

  const screenLines = [...filledTranscript, ...footerLines.map((line) => padOrTrimToWidth(line, width))];
  const content = screenLines.join("\n");
  const cursor = computeComposerCursor(state, width);
  const composerBaseRow = transcriptHeight + 1;

  write("\u001b[1;1H");
  write(content);
  write(`\u001b[${composerBaseRow + cursor.rowOffset};${cursor.column}H`);
  write("\u001b[?25h");
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

  const onData = (chunk: string | Buffer | Uint8Array): void => {
    handleTerminalInputChunk(chunk, state, {
      onDraftChange: input.handlers.onDraftChange,
      onSubmit: input.handlers.onSubmit,
      onInterrupt: input.handlers.onInterrupt,
      onToggleInspector: input.handlers.onToggleInspector,
      onExit: input.handlers.onExit,
    });
  };

  const onResize = (): void => {
    if (started) {
      renderScreen(state, stdout, write);
    }
  };

  return {
    update(nextState: TuiState): void {
      state = nextState;

      if (started) {
        renderScreen(state, stdout, write);
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
      renderScreen(state, stdout, write);
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
