import type { ThemeDefinition } from "../theme-types.ts";

export const slytherinTheme: ThemeDefinition = {
  id: "slytherin",
  displayName: "Slytherin",
  animal: "Serpent",
  paletteLabel: "green / silver",
  availability: "available",
  palette: {
    text: {
      heading: "#2F7A38",
      body: "#4A5A4F",
      muted: "#7A827B",
      selected: "#E4F0E6",
    },
    chrome: {
      user: "#2F7A38",
      assistant: "#879086",
      utility: "#2F7A38",
      execution: "#8A908D",
      footer: "#2F7A38",
      selection: "#98A3AE",
    },
    surface: {
      userCardBg: "#EEF6EF",
      composerBg: "#E7F0E8",
    },
    token: {
      command: "#2F7A38",
      path: "#6F766F",
      shortcut: "#98A3AE",
      status: "#2F7A38",
      inlineCodeFg: "#F5FBF6",
      inlineCodeBg: "#1C2A20",
    },
    glyph: {
      mist_light: "#AEB3AF",
      mist_mid: "#8A908D",
      mist_dark: "#7A817D",
      shadow: "#165517",
      chin: "#2F7A38",
      highlight: "#FFFFFF",
      mystic: "#98A3AE",
    },
  },
  welcome: {
    title: "Welcome back!",
    subtitle: "Slytherin Serpent is standing by",
    glyphRows: [
      [{ color: "mist_mid", text: "       ░ · ░  · ░" }],
      [
        { color: "mist_dark", text: "     ░▒ " },
        { color: "shadow", text: "▗▄▓" },
        { color: "chin", text: "████" },
        { color: "shadow", text: "▓▄▖" },
        { color: "mist_dark", text: " ~▒░" },
      ],
      [
        { color: "mist_mid", text: "      ░ " },
        { color: "shadow", text: "▐▓" },
        { color: "chin", text: "█" },
        { color: "mystic", text: "▚▀▀▞" },
        { color: "chin", text: "█" },
        { color: "shadow", text: "▓▌" },
        { color: "mist_mid", text: " ░" },
      ],
      [
        { color: "mist_dark", text: "     ░▒ " },
        { color: "shadow", text: "▐▓▌" },
        { color: "chin", text: "◥██◤" },
        { color: "shadow", text: "▐▓▌" },
        { color: "mist_dark", text: " ·▒░" },
      ],
      [
        { color: "mist_light", text: "       ░▒ " },
        { color: "shadow", text: "▝▀▓" },
        { color: "highlight", text: "▼▼" },
        { color: "shadow", text: "▓▀▘" },
        { color: "mist_light", text: "  ›_" },
      ],
    ],
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
