import type { TuiState } from "./tui-types.ts";

export type InteractiveTuiHandlers = {
  onDraftChange: (draft: string) => void;
  onSubmit: (prompt: string) => void;
  onInterrupt: () => void;
  onToggleInspector: () => void;
  onFocusTimeline: () => void;
  onFocusComposer: () => void;
  onMoveSelectionUp: () => void;
  onMoveSelectionDown: () => void;
  onToggleSelectedItem: () => void;
  onExit: () => void;
};

export type TerminalTuiInputChunk = string | Buffer | Uint8Array;

export type TerminalTuiInput = {
  on: (event: "data", listener: (chunk: TerminalTuiInputChunk) => void) => unknown;
  off?: (event: "data", listener: (chunk: TerminalTuiInputChunk) => void) => unknown;
  removeListener?: (event: "data", listener: (chunk: TerminalTuiInputChunk) => void) => unknown;
  setRawMode?: (enabled: boolean) => void;
  isTTY?: boolean;
};

export type TerminalTuiOutput = {
  write: (chunk: string) => unknown;
  columns?: number;
  rows?: number;
  on?: (event: "resize", listener: () => void) => unknown;
  off?: (event: "resize", listener: () => void) => unknown;
  removeListener?: (event: "resize", listener: () => void) => unknown;
};

export type TerminalTuiIo = {
  stdin?: TerminalTuiInput;
  stdout?: TerminalTuiOutput;
  write?: (chunk: string) => void;
};

export type InteractiveTuiAppFactoryInput = {
  initialState: TuiState;
  handlers: InteractiveTuiHandlers;
  terminal?: TerminalTuiIo;
};

export type InteractiveTuiApp = {
  update: (state: TuiState) => void;
  start: () => Promise<void> | void;
  close: () => Promise<void> | void;
};

export type CreateInteractiveTuiApp = (
  input: InteractiveTuiAppFactoryInput,
) => InteractiveTuiApp;
