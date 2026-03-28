import type { ThemeDefinition } from "../theme-types.ts";

export const hufflepuffTheme: ThemeDefinition = {
  id: "hufflepuff",
  displayName: "Hufflepuff",
  animal: "Badger",
  paletteLabel: "yellow / gray",
  availability: "available",
  palette: {
    text: {
      heading: "#1F1A12",
      body: "#3A3128",
      muted: "#7A746C",
      selected: "#F6E8B3",
    },
    chrome: {
      user: "#D6A93D",
      assistant: "#64748B",
      utility: "#B8892C",
      footer: "#D6A93D",
      selection: "#F2D16B",
    },
    token: {
      command: "#D6A93D",
      path: "#7A746C",
      shortcut: "#7AA9D9",
      status: "#D6A93D",
      inlineCodeFg: "#F9F4E8",
      inlineCodeBg: "#2C2620",
    },
    glyph: {
      mist_light: "#D8D1C8",
      mist_mid: "#A8A198",
      mist_dark: "#726B63",
      shadow: "#2A2724",
      chin: "#D6A93D",
      highlight: "#F2D16B",
      mystic: "#7AA9D9",
    },
  },
  welcome: {
    title: "Welcome back!",
    subtitle: "Hufflepuff Badger is standing by",
    glyphRows: [
      [
        { color: "mist_mid", text: "   ░ " },
        { color: "mystic", text: "·" },
        { color: "mist_mid", text: " ░  · ░" },
      ],
      [
        { color: "mist_dark", text: " ░▒ " },
        { color: "shadow", text: "▗▛██▖ ▗██▜▖" },
        { color: "mystic", text: " ~" },
        { color: "mist_dark", text: "▒░" },
      ],
      [
        { color: "mist_mid", text: "  ░ " },
        { color: "shadow", text: "▐██▙▜█ █▛▟██▌" },
        { color: "mist_mid", text: " ░" },
      ],
      [
        { color: "mist_dark", text: " ░▒ " },
        { color: "shadow", text: "▐██▛◦█ █◦▜██▌" },
        { color: "mystic", text: " ·" },
        { color: "mist_dark", text: "▒░" },
      ],
      [
        { color: "mist_light", text: "   ░▒ " },
        { color: "chin", text: "▝▜██▇▇██▛▘" },
        { color: "highlight", text: " ›_" },
      ],
    ],
  },
  sample: {
    tipTitle: "Tips for getting started",
    tipText: "Run /help to inspect available commands.",
    highlightTitle: "Highlight sample",
    highlightTokens: [
      { kind: "command", text: "/theme" },
      { kind: "path", text: "README.md" },
      { kind: "shortcut", text: "Ctrl+C" },
      { kind: "status", text: "ready" },
    ],
  },
};
