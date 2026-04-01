import type { ThemeDefinition } from "../theme-types.ts";

export const originTheme: ThemeDefinition = {
  id: "origin",
  displayName: "Origin",
  animal: "Terminal",
  paletteLabel: "neutral / slate",
  availability: "available",
  palette: {
    text: {
      heading: "#111827",
      body: "#1F2937",
      muted: "#6B7280",
      selected: "#111827",
    },
    chrome: {
      user: "#4FAF7C",
      assistant: "#111827",
      utility: "#B7791F",
      execution: "#B7791F",
      footer: "#4B5563",
      selection: "#2563EB",
    },
    surface: {
      userCardBg: "#F3F4F6",
      composerBg: "#F3F4F6",
    },
    token: {
      command: "#2563EB",
      path: "#4FAF7C",
      shortcut: "#7C3AED",
      status: "#B7791F",
      inlineCodeFg: "#F8FAFC",
      inlineCodeBg: "#111827",
    },
    glyph: {
      mist_light: "#D1D5DB",
      mist_mid: "#9CA3AF",
      mist_dark: "#6B7280",
      shadow: "#374151",
      chin: "#4B5563",
      highlight: "#2563EB",
      mystic: "#4FAF7C",
    },
  },
  welcome: {
    title: "Welcome to expecto",
    subtitle: "The classic interface is standing by",
    glyphRows: [],
  },
  sample: {
    tipTitle: "Tips",
    tipText: "Run /help to inspect available commands.",
    highlightTitle: "Highlights",
    highlightTokens: [
      { kind: "command", text: "/theme" },
      { kind: "path", text: "README.md" },
      { kind: "shortcut", text: "Ctrl+C" },
      { kind: "status", text: "ready" },
    ],
  },
};
