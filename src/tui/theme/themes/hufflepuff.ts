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
      assistant: "#8A928F",
      utility: "#A98022",
      execution: "#756C60",
      footer: "#D6A93D",
      selection: "#F2D16B",
    },
    surface: {
      userCardBg: "#FBF6EA",
      composerBg: "#F3EAD0",
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
      mist_light: "#E4DFD8",
      mist_mid: "#C4BCB3",
      mist_dark: "#9F968D",
      shadow: "#635D57",
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
  conversation: {
    user: "Badger Prompt",
    assistant: "Badger Reply",
  },
};
