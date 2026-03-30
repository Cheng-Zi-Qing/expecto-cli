import type { ThemeDefinition } from "../theme-types.ts";

export const gryffindorTheme: ThemeDefinition = {
  id: "gryffindor",
  displayName: "Gryffindor",
  animal: "Lion",
  paletteLabel: "crimson / gold",
  availability: "available",
  palette: {
    text: {
      heading: "#271A16",
      body: "#4B3A31",
      muted: "#7D6D63",
      selected: "#F2D7A0",
    },
    chrome: {
      user: "#A3362F",
      assistant: "#8E857D",
      utility: "#B88533",
      execution: "#756B61",
      footer: "#A3362F",
      selection: "#D0A04A",
    },
    surface: {
      userCardBg: "#FBF1E8",
      composerBg: "#F4E5D8",
    },
    token: {
      command: "#A3362F",
      path: "#7D6D63",
      shortcut: "#D0A04A",
      status: "#A3362F",
      inlineCodeFg: "#FAF2E8",
      inlineCodeBg: "#312520",
    },
    glyph: {
      mist_light: "#D8D0C4",
      mist_mid: "#9A938A",
      mist_dark: "#6F6860",
      shadow: "#8F2F29",
      chin: "#B88533",
      highlight: "#D0A04A",
      mystic: "#6B231E",
    },
  },
  welcome: {
    title: "Welcome back!",
    subtitle: "Gryffindor Lion is standing by",
    glyphRows: [
      [
        { color: "mist_mid", text: "   ░ · ░  · ░" },
      ],
      [
        { color: "mist_mid", text: " ░▒ " },
        { color: "highlight", text: "▗▞▓" },
        { color: "shadow", text: "████" },
        { color: "highlight", text: "▓▚▖" },
        { color: "mist_mid", text: " ~▒░" },
      ],
      [
        { color: "mist_mid", text: "  ░ " },
        { color: "chin", text: "▐▓" },
        { color: "shadow", text: "██▛▀▜██" },
        { color: "chin", text: "▓▌" },
        { color: "mist_mid", text: " ░" },
      ],
      [
        { color: "mist_mid", text: " ░▒ " },
        { color: "chin", text: "▐▓" },
        { color: "shadow", text: "██▌" },
        { color: "highlight", text: "▼" },
        { color: "shadow", text: "▐██" },
        { color: "chin", text: "▓▌" },
        { color: "mist_mid", text: "·▒░" },
      ],
      [
        { color: "mist_light", text: "   ░▒ " },
        { color: "mystic", text: "▝▀████▀" },
        { color: "mist_light", text: "▘ ›_" },
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
