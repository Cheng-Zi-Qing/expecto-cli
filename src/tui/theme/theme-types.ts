export const THEME_IDS = [
  "hufflepuff",
  "gryffindor",
  "ravenclaw",
  "slytherin",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeAvailability = "available" | "planned";

export type ThemeGlyphColorRole =
  | "mist_light"
  | "mist_mid"
  | "mist_dark"
  | "shadow"
  | "chin"
  | "highlight"
  | "mystic";

export type ThemeGlyphSegment = {
  color: ThemeGlyphColorRole;
  text: string;
};

export type ThemeGlyphRow = ThemeGlyphSegment[];

export type ThemeSampleTokenKind =
  | "command"
  | "path"
  | "shortcut"
  | "status";

export type ThemeSampleToken = {
  kind: ThemeSampleTokenKind;
  text: string;
};

export type ThemeWelcomeAsset = {
  title: string;
  subtitle: string;
  glyphRows: ThemeGlyphRow[];
};

export type ThemeSampleAsset = {
  tipTitle: string;
  tipText: string;
  highlightTitle: string;
  highlightTokens: ThemeSampleToken[];
};

export type ThemePalette = {
  text: {
    heading: string;
    body: string;
    muted: string;
    selected: string;
  };
  chrome: {
    user: string;
    assistant: string;
    utility: string;
    execution: string;
    footer: string;
    selection: string;
  };
  surface: {
    userCardBg: string;
    composerBg: string;
  };
  token: {
    command: string;
    path: string;
    shortcut: string;
    status: string;
    inlineCodeFg: string;
    inlineCodeBg: string;
  };
  glyph: Record<ThemeGlyphColorRole, string>;
};

export type ThemeDefinition = {
  id: ThemeId;
  displayName: string;
  animal: string;
  paletteLabel: string;
  availability: ThemeAvailability;
  palette: ThemePalette;
  welcome: ThemeWelcomeAsset;
  sample: ThemeSampleAsset;
};

export function isThemeId(value: string): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}
