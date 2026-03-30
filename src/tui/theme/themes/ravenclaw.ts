import type { ThemeDefinition } from "../theme-types.ts";

export const ravenclawTheme: ThemeDefinition = {
  id: "ravenclaw",
  displayName: "Ravenclaw",
  animal: "Eagle",
  paletteLabel: "blue / gold",
  availability: "available",
  palette: {
    text: {
      heading: "#1E2B3B",
      body: "#32475F",
      muted: "#6E7580",
      selected: "#D9E7FA",
    },
    chrome: {
      user: "#2C5A8A",
      assistant: "#88939E",
      utility: "#C9A23A",
      execution: "#69717A",
      footer: "#2C5A8A",
      selection: "#D6A93D",
    },
    surface: {
      userCardBg: "#F2F6FA",
      composerBg: "#EAF0F6",
    },
    token: {
      command: "#2C5A8A",
      path: "#7A746C",
      shortcut: "#D6A93D",
      status: "#2C5A8A",
      inlineCodeFg: "#F7FAFD",
      inlineCodeBg: "#243041",
    },
    glyph: {
      mist_light: "#BFC3CA",
      mist_mid: "#8E939B",
      mist_dark: "#6E737B",
      shadow: "#2F70D8",
      chin: "#F2C84C",
      highlight: "#565C66",
      mystic: "#EEF1F4",
    },
  },
  welcome: {
    title: "Welcome back!",
    subtitle: "Ravenclaw Eagle is standing by",
    glyphRows: [
      [
        { color: "mist_mid", text: "       ░ · ░  · ░" },
      ],
      [
        { color: "mist_mid", text: "     ░▒  " },
        { color: "shadow", text: "▗▄████▄" },
        { color: "mist_mid", text: "  ~▒░" },
      ],
      [
        { color: "mist_mid", text: "      ░ " },
        { color: "shadow", text: "▗████▛▀" },
        { color: "chin", text: "▜▖" },
        { color: "mist_mid", text: "  ░" },
      ],
      [
        { color: "mist_mid", text: "     ░▒ " },
        { color: "shadow", text: "▐████▌" },
        { color: "highlight", text: "◉" },
        { color: "mist_mid", text: " " },
        { color: "chin", text: "◥▖" },
        { color: "mist_mid", text: "·▒░" },
      ],
      [
        { color: "mist_light", text: "       ░▒ " },
        { color: "shadow", text: "▝▀███▀" },
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
