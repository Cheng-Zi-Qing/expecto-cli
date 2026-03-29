import {
  renderThemePickerOverlay,
  renderTranscriptLines,
} from "../renderer-terminal/transcript-renderer.ts";
import type { TuiState, TuiRuntimeState } from "../tui-types.ts";
import { buildTuiFooterView, buildTuiViewModel } from "../view-model/tui-view-model.ts";
import type {
  ActiveStatusSnapshot,
  ComposerSnapshot,
} from "./screen-writer.ts";

export type StickyScreenProjection = {
  transcriptLines: string[];
  composer: ComposerSnapshot;
  activeStatus: ActiveStatusSnapshot;
};

function createActiveStatusText(runtimeState: TuiRuntimeState): ActiveStatusSnapshot {
  switch (runtimeState) {
    case "streaming":
      return {
        kind: "thinking",
        text: "Thinking...",
      };
    case "tool_running":
      return {
        kind: "executing",
        text: "Running tool...",
      };
    case "interrupted":
      return {
        kind: "interrupting",
        text: "Interrupted",
      };
    case "error":
      return {
        kind: "error",
        text: "Needs attention",
      };
    case "idle":
    case "ready":
      return null;
  }
}

function createComposerSnapshot(state: TuiState): ComposerSnapshot {
  const footerView = buildTuiFooterView(state);
  const themePickerActive = state.themePicker !== null;

  return {
    text: state.draft,
    cursorOffset: Array.from(state.draft).length,
    locked: state.inputLocked || themePickerActive,
    hidden: themePickerActive,
    placeholder:
      themePickerActive
        ? ""
        : state.inputLocked
          ? "Waiting for response..."
          : "Write a prompt",
    statusLabel: footerView.status.runtimeLabel,
    theme: footerView.theme,
  };
}

function shouldHidePendingAssistantPlaceholder(
  item: TuiState["timeline"][number],
): boolean {
  return (
    item.kind === "assistant" &&
    (item.body ?? "").length === 0 &&
    item.summary === "Thinking..."
  );
}

function createTranscriptState(state: TuiState): TuiState {
  if (!state.timeline.some((item) => shouldHidePendingAssistantPlaceholder(item))) {
    return state;
  }

  return {
    ...state,
    timeline: state.timeline.filter((item) => !shouldHidePendingAssistantPlaceholder(item)),
  };
}

export function projectStickyScreenState(
  state: TuiState,
  width: number,
): StickyScreenProjection {
  const transcriptState = createTranscriptState(state);
  const viewModel = buildTuiViewModel(transcriptState);

  return {
    transcriptLines:
      viewModel.overlay?.kind === "theme_picker"
        ? renderThemePickerOverlay(viewModel.overlay, width)
        : renderTranscriptLines(viewModel.transcript, width),
    composer: createComposerSnapshot(state),
    activeStatus: createActiveStatusText(state.runtimeState),
  };
}
