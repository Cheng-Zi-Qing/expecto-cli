import { getThemeDefinition } from "../theme/theme-registry.ts";
import type { ThemeSpellLabels } from "../theme/theme-types.ts";
import type { TuiRuntimeState, TuiState } from "../tui-types.ts";
import { buildTimelineCards } from "./timeline-blocks.ts";
import type {
  TuiFooterView,
  TuiOverlayView,
  TuiTranscriptView,
  TuiViewModel,
} from "./tui-view-types.ts";

function displayRuntimeState(runtimeState: TuiRuntimeState, spells: ThemeSpellLabels): string {
  switch (runtimeState) {
    case "streaming":
      return spells.statusStreaming;
    case "tool_running":
      return spells.statusToolRunning;
    case "interrupted":
      return spells.statusInterrupted;
    case "error":
      return spells.statusError;
    case "idle":
      return spells.statusIdle;
    case "ready":
      return spells.statusReady;
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
    labels: {
      composerTitle: theme.spells.composerTitle,
      themePickerTitle: theme.spells.themePickerTitle,
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
            : displayRuntimeState(state.runtimeState, theme.spells),
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
  state: Pick<TuiState, "themePicker" | "activeThemeId">,
): TuiOverlayView | null {
  if (state.themePicker === null) {
    return null;
  }

  const sampleTheme = getThemeDefinition(state.themePicker.selectedThemeId);
  const activeTheme = getThemeDefinition(state.activeThemeId);

  return {
    kind: "theme_picker",
    reason: state.themePicker.reason,
    labels: {
      composerTitle: activeTheme.spells.composerTitle,
      themePickerTitle: activeTheme.spells.themePickerTitle,
    },
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
