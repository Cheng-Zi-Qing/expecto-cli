import type { MarkdownBlock } from "../block-model/block-types.ts";
import type { TimelineItemKind } from "../tui-types.ts";
import type {
  ThemeAvailability,
  ThemeId,
  ThemePalette,
  ThemeGlyphRow,
  ThemeSampleAsset,
  ThemeSampleToken,
  ThemeWelcomeAsset,
} from "../theme/theme-types.ts";
import type { ThemePickerReason } from "../tui-types.ts";

export type TuiBadgeRowBlock = {
  kind: "badge_row";
  badges: string[];
};

export type TuiTranscriptTextBlock = {
  kind: "transcript_block";
  lines: string[];
};

export type TuiTranscriptContentBlock =
  | MarkdownBlock
  | TuiBadgeRowBlock
  | TuiTranscriptTextBlock
  | {
      kind: "theme_welcome";
      title: string;
      subtitle: string;
      glyphRows: ThemeGlyphRow[];
      tipTitle: string;
      tipText: string;
      highlightTitle: string;
      highlightTokens: ThemeSampleToken[];
    };

export type TuiTranscriptBlock = {
  id: string;
  kind: TimelineItemKind;
  summary: string;
  headerLabel: string;
  selected: boolean;
  collapsed: boolean;
  blocks: TuiTranscriptContentBlock[];
};

export type TuiTranscriptView = {
  theme: {
    id: ThemeId;
    palette: ThemePalette;
  };
  blocks: TuiTranscriptBlock[];
};

export type TuiFooterView = {
  composer: {
    value: string;
    locked: boolean;
  };
  status: {
    runtimeLabel: string;
  };
  themePicker?: {
    selectedThemeId: ThemeId;
    entries: TuiThemePickerEntryView[];
    required: boolean;
  };
};

export type TuiThemePickerEntryView = {
  id: ThemeId;
  displayName: string;
  animal: string;
  paletteLabel: string;
  availability: ThemeAvailability;
  selected: boolean;
};

export type TuiThemePickerSampleThemeView = {
  id: ThemeId;
  displayName: string;
  animal: string;
  availability: ThemeAvailability;
  palette: ThemePalette;
  welcome: ThemeWelcomeAsset;
  sample: ThemeSampleAsset;
};

export type TuiThemePickerOverlayView = {
  kind: "theme_picker";
  reason: ThemePickerReason;
  entries: TuiThemePickerEntryView[];
  sampleTheme: TuiThemePickerSampleThemeView;
};

export type TuiOverlayView = TuiThemePickerOverlayView;

export type TuiViewModel = {
  transcript: TuiTranscriptView;
  footer: TuiFooterView;
  overlay: TuiOverlayView | null;
};
