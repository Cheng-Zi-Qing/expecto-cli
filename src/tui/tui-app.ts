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

export type InteractiveTuiAppFactoryInput = {
  initialState: TuiState;
  handlers: InteractiveTuiHandlers;
};

export type InteractiveTuiApp = {
  update: (state: TuiState) => void;
  start: () => Promise<void> | void;
  close: () => Promise<void> | void;
};

export type CreateInteractiveTuiApp = (
  input: InteractiveTuiAppFactoryInput,
) => InteractiveTuiApp;
