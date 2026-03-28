import { hufflepuffTheme } from "./themes/hufflepuff.ts";
import type { ThemeDefinition, ThemeId } from "./theme-types.ts";

function createPlannedTheme(
  id: ThemeId,
  displayName: string,
  animal: string,
  paletteLabel: string,
): ThemeDefinition {
  const accent =
    id === "gryffindor"
      ? "#A3362F"
      : id === "ravenclaw"
        ? "#2C5A8A"
        : "#2E6B45";

  return {
    id,
    displayName,
    animal,
    paletteLabel,
    availability: "planned",
    palette: {
      text: {
        heading: "#1F1A12",
        body: "#3A3128",
        muted: "#7A746C",
        selected: "#F6E8B3",
      },
      chrome: {
        user: accent,
        assistant: "#64748B",
        utility: accent,
        footer: accent,
        selection: "#F6E8B3",
      },
      token: {
        command: accent,
        path: "#7A746C",
        shortcut: "#7AA9D9",
        status: accent,
        inlineCodeFg: "#F9F4E8",
        inlineCodeBg: "#2C2620",
      },
      glyph: {
        mist_light: "#D8D1C8",
        mist_mid: "#A8A198",
        mist_dark: "#726B63",
        shadow: "#2A2724",
        chin: accent,
        highlight: "#F6E8B3",
        mystic: "#7AA9D9",
      },
    },
    welcome: {
      title: "Welcome back!",
      subtitle: `${displayName} ${animal} preview is still in progress`,
      glyphRows: [
        [{ color: "mist_mid", text: `${displayName} preview` }],
      ],
    },
    sample: {
      tipTitle: "Theme preview",
      tipText: `${displayName} assets are planned for a later pass.`,
      highlightTitle: "Highlight sample",
      highlightTokens: [
        { kind: "command", text: "/theme" },
        { kind: "path", text: "README.md" },
        { kind: "shortcut", text: "Ctrl+C" },
        { kind: "status", text: "planned" },
      ],
    },
  };
}

const themeDefinitions: ThemeDefinition[] = [
  hufflepuffTheme,
  createPlannedTheme("gryffindor", "Gryffindor", "Lion", "red / gold"),
  createPlannedTheme("ravenclaw", "Ravenclaw", "Eagle", "blue / bronze"),
  createPlannedTheme("slytherin", "Slytherin", "Serpent", "green / silver"),
];

const themeDefinitionMap = new Map(
  themeDefinitions.map((theme) => [theme.id, theme] as const),
);

export function listThemeDefinitions(): ThemeDefinition[] {
  return [...themeDefinitions];
}

export function getThemeDefinition(id: ThemeId): ThemeDefinition {
  const theme = themeDefinitionMap.get(id);

  if (theme === undefined) {
    throw new Error(`Unknown theme id: ${id}`);
  }

  return theme;
}

export function getDefaultThemeId(): ThemeId {
  return "hufflepuff";
}
