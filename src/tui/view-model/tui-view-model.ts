import { getThemeDefinition } from "../theme/theme-registry.ts";
import type { TuiRuntimeState, TuiState } from "../tui-types.ts";
import { buildTimelineCards } from "./timeline-blocks.ts";
import type {
  TuiFooterView,
  TuiOverlayView,
  TuiTranscriptView,
  TuiViewModel,
} from "./tui-view-types.ts";

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

export function buildTuiFooterView(
  state: Pick<TuiState, "draft" | "inputLocked" | "runtimeState" | "themePicker" | "activeThemeId">,
): TuiFooterView {
  const previewThemeId = state.themePicker?.selectedThemeId ?? state.activeThemeId;
  const theme = getThemeDefinition(previewThemeId);
  const footer: TuiFooterView = {
    theme: {
      id: theme.id,
      palette: theme.palette,
    },
    composer: {
      value: state.draft,
      locked: state.inputLocked || state.themePicker !== null,
    },
    status: {
      runtimeLabel:
        state.themePicker?.reason === "first_launch"
          ? "Selection required"
          : state.themePicker?.reason === "command"
            ? "Theme preview"
            : displayRuntimeState(state.runtimeState),
    },
  };

  if (state.themePicker !== null) {
    footer.themePicker = {
      selectedThemeId: state.themePicker.selectedThemeId,
      entries: state.themePicker.themeIds.map((themeId) => {
        const theme = getThemeDefinition(themeId);

        return {
          id: theme.id,
          displayName: theme.displayName,
          animal: theme.animal,
          paletteLabel: theme.paletteLabel,
          availability: theme.availability,
          selected: theme.id === state.themePicker?.selectedThemeId,
        };
      }),
      required: state.themePicker.reason === "first_launch",
    };
  }

  return footer;
}

export function buildTuiTranscriptView(
  state: Pick<TuiState, "timeline" | "selectedTimelineIndex" | "activeThemeId" | "themePicker">,
): TuiTranscriptView {
  const previewThemeId = state.themePicker?.selectedThemeId ?? state.activeThemeId;
  const theme = getThemeDefinition(previewThemeId);

  return {
    theme: {
      id: theme.id,
      palette: theme.palette,
    },
    blocks: buildTimelineCards(
      state.timeline,
      state.selectedTimelineIndex,
      previewThemeId,
    ).map((card) => ({
      ...card,
      blocks: card.blocks.map((block) => ({ ...block })),
    })),
  };
}

function buildOverlayView(
  state: Pick<TuiState, "themePicker">,
): TuiOverlayView | null {
  if (state.themePicker === null) {
    return null;
  }

  const sampleTheme = getThemeDefinition(state.themePicker.selectedThemeId);

  return {
    kind: "theme_picker",
    reason: state.themePicker.reason,
    entries: state.themePicker.themeIds.map((themeId) => {
      const theme = getThemeDefinition(themeId);

      return {
        id: theme.id,
        displayName: theme.displayName,
        animal: theme.animal,
        paletteLabel: theme.paletteLabel,
        availability: theme.availability,
        selected: theme.id === state.themePicker?.selectedThemeId,
      };
    }),
    sampleTheme: {
      id: sampleTheme.id,
      displayName: sampleTheme.displayName,
      animal: sampleTheme.animal,
      availability: sampleTheme.availability,
      palette: sampleTheme.palette,
      welcome: sampleTheme.welcome,
      sample: sampleTheme.sample,
    },
  };
}

export function buildTuiViewModel(state: TuiState): TuiViewModel {
  return {
    transcript: buildTuiTranscriptView(state),
    footer: buildTuiFooterView(state),
    overlay: buildOverlayView(state),
  };
}
