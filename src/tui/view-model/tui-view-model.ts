import type { TuiRuntimeState, TuiState } from "../tui-types.ts";
import { buildTimelineCards } from "./timeline-blocks.ts";
import type { TuiFooterView, TuiTranscriptView, TuiViewModel } from "./tui-view-types.ts";

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

export function buildTuiFooterView(state: Pick<TuiState, "draft" | "inputLocked" | "runtimeState">): TuiFooterView {
  return {
    composer: {
      value: state.draft,
      locked: state.inputLocked,
    },
    status: {
      runtimeLabel: displayRuntimeState(state.runtimeState),
    },
  };
}

export function buildTuiTranscriptView(
  state: Pick<TuiState, "timeline" | "selectedTimelineIndex">,
): TuiTranscriptView {
  return {
    blocks: buildTimelineCards(state.timeline, state.selectedTimelineIndex).map((card) => ({
      ...card,
      blocks: card.blocks.map((block) => ({ ...block })),
    })),
  };
}

export function buildTuiViewModel(state: TuiState): TuiViewModel {
  return {
    transcript: buildTuiTranscriptView(state),
    footer: buildTuiFooterView(state),
    overlay: null,
  };
}
