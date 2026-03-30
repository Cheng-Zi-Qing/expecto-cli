import blessed from "neo-blessed";

import type { TextToken } from "../block-model/text-tokens.ts";
import type { CommandMenuState, TuiFocus } from "../tui-types.ts";
import { getDefaultThemeId, getThemeDefinition } from "../theme/theme-registry.ts";
import type { ThemeGlyphColorRole, ThemeId } from "../theme/theme-types.ts";
import { getVisibleComposerLines } from "./composer-layout.ts";

export type RendererPalette = {
  timeline: {
    text: string;
    body: string;
    muted: string;
    guide: string;
    hint: string;
    bg: string;
    border: string;
    label: string;
    card: {
      welcome: {
        border: string;
        label: string;
        summary: string;
        body: string;
      };
      system: {
        border: string;
        label: string;
        summary: string;
        body: string;
      };
      user: {
        border: string;
        label: string;
        summary: string;
        body: string;
        bg: string;
      };
      assistant: {
        border: string;
        label: string;
        summary: string;
        body: string;
      };
      execution: {
        border: string;
        label: string;
        summary: string;
        body: string;
        transcriptBg: string;
      };
    };
    token: {
      default: {
        fg: string;
      };
      muted: {
        fg: string;
      };
      inlineCode: {
        fg: string;
        bg: string;
      };
      command: {
        fg: string;
      };
      path: {
        fg: string;
      };
      shortcut: {
        fg: string;
      };
      status: {
        fg: string;
      };
    };
    glyph: Record<ThemeGlyphColorRole, string>;
    executionGuide: string;
    selectedMarker: string;
    selectedText: string;
  };
  composer: {
    text: string;
    border: string;
    label: string;
    placeholder: string;
    cursor: string;
    bg: string;
  };
  commandMenu: {
    text: string;
    description: string;
    muted: string;
    empty: string;
    border: string;
    label: string;
    bg: string;
    selectedMarker: string;
    selectedText: string;
  };
  inspector: {
    text: string;
    border: string;
    bg: string;
  };
  statusBar: {
    fg: string;
    bg: string;
  };
};

type CreateRendererPaletteInput = {
  focus: TuiFocus;
  inputLocked: boolean;
  themeId?: ThemeId;
};

type RenderComposerMarkupInput = {
  draft: string;
  inputLocked: boolean;
  palette: RendererPalette;
  maxLineWidth?: number;
};

type RenderCommandMenuMarkupInput = CommandMenuState & {
  palette: RendererPalette;
};

type TextStyle = {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
};

export function styleText(text: string, style: TextStyle): string {
  const escaped = blessed.escape(text);
  const openings: string[] = [];
  const closings: string[] = [];

  if (style.bold) {
    openings.push("{bold}");
    closings.unshift("{/bold}");
  }

  if (style.dim) {
    openings.push("{dim}");
    closings.unshift("{/dim}");
  }

  if (style.fg !== undefined) {
    openings.push(`{${style.fg}-fg}`);
    closings.unshift(`{/${style.fg}-fg}`);
  }

  if (style.bg !== undefined) {
    openings.push(`{${style.bg}-bg}`);
    closings.unshift(`{/${style.bg}-bg}`);
  }

  return `${openings.join("")}${escaped}${closings.join("")}`;
}

function colorize(text: string, color: string, bold = false): string {
  return styleText(text, {
    fg: color,
    bold,
  });
}

function renderTokenSegment(token: TextToken, palette: RendererPalette): string {
  switch (token.kind) {
    case "default":
      return styleText(token.text, {
        fg: palette.timeline.token.default.fg,
      });
    case "muted":
      return styleText(token.text, {
        fg: palette.timeline.token.muted.fg,
      });
    case "inline_code":
      return styleText(token.text, {
        fg: palette.timeline.token.inlineCode.fg,
        bg: palette.timeline.token.inlineCode.bg,
      });
    case "command":
      return styleText(token.text, {
        fg: palette.timeline.token.command.fg,
        bold: true,
      });
    case "path":
      return styleText(token.text, {
        fg: palette.timeline.token.path.fg,
      });
    case "shortcut":
      return styleText(token.text, {
        fg: palette.timeline.token.shortcut.fg,
        bold: true,
      });
    case "status":
      return styleText(token.text, {
        fg: palette.timeline.token.status.fg,
        bold: true,
      });
  }
}

export function renderInlineTextTokens(
  tokens: TextToken[],
  palette: RendererPalette,
): string {
  const lines = [""];

  for (const token of tokens) {
    const segments = token.text.split("\n");

    segments.forEach((segment, index) => {
      if (segment.length > 0) {
        lines[lines.length - 1] += renderTokenSegment(
          {
            ...token,
            text: segment,
          },
          palette,
        );
      }

      if (index < segments.length - 1) {
        lines.push("");
      }
    });
  }

  return lines.join("\n");
}

export function createRendererPalette(
  input: CreateRendererPaletteInput,
): RendererPalette {
  const theme = getThemeDefinition(input.themeId ?? getDefaultThemeId());

  return {
    timeline: {
      text: theme.palette.text.heading,
      body: theme.palette.text.body,
      muted: theme.palette.text.muted,
      guide: theme.palette.text.muted,
      hint: theme.palette.text.body,
      bg: "#F8FAFC",
      border: input.focus === "timeline" ? theme.palette.chrome.selection : theme.palette.text.muted,
      label: theme.palette.chrome.utility,
      card: {
        welcome: {
          border: theme.palette.chrome.utility,
          label: theme.palette.chrome.utility,
          summary: theme.palette.text.heading,
          body: theme.palette.text.body,
        },
        system: {
          border: theme.palette.chrome.utility,
          label: theme.palette.chrome.utility,
          summary: theme.palette.text.heading,
          body: theme.palette.text.body,
        },
        user: {
          border: theme.palette.chrome.user,
          label: theme.palette.chrome.user,
          summary: theme.palette.text.heading,
          body: theme.palette.text.body,
          bg: theme.palette.surface.userCardBg,
        },
        assistant: {
          border: theme.palette.chrome.assistant,
          label: theme.palette.chrome.assistant,
          summary: theme.palette.text.heading,
          body: theme.palette.text.body,
        },
        execution: {
          border: theme.palette.chrome.utility,
          label: theme.palette.chrome.utility,
          summary: theme.palette.text.heading,
          body: theme.palette.text.body,
          transcriptBg: "#F3F4F6",
        },
      },
      token: {
        default: {
          fg: theme.palette.text.body,
        },
        muted: {
          fg: theme.palette.text.muted,
        },
        inlineCode: {
          fg: theme.palette.token.inlineCodeFg,
          bg: theme.palette.token.inlineCodeBg,
        },
        command: {
          fg: theme.palette.token.command,
        },
        path: {
          fg: theme.palette.token.path,
        },
        shortcut: {
          fg: theme.palette.token.shortcut,
        },
        status: {
          fg: theme.palette.token.status,
        },
      },
      glyph: theme.palette.glyph,
      executionGuide: theme.palette.chrome.utility,
      selectedMarker: theme.palette.chrome.selection,
      selectedText: theme.palette.text.selected,
    },
    composer: {
      text: theme.palette.text.body,
      border: input.focus === "composer" ? theme.palette.chrome.user : theme.palette.text.muted,
      label: theme.palette.chrome.user,
      placeholder: theme.palette.text.muted,
      cursor: input.inputLocked ? theme.palette.chrome.selection : theme.palette.chrome.user,
      bg: theme.palette.surface.composerBg,
    },
    commandMenu: {
      text: theme.palette.chrome.user,
      description: theme.palette.text.body,
      muted: theme.palette.text.muted,
      empty: theme.palette.text.muted,
      border: theme.palette.text.muted,
      label: theme.palette.chrome.user,
      bg: "#EEF2F7",
      selectedMarker: theme.palette.chrome.selection,
      selectedText: theme.palette.text.selected,
    },
    inspector: {
      text: theme.palette.text.body,
      border: theme.palette.text.muted,
      bg: "#F3F4F6",
    },
    statusBar: {
      fg: theme.palette.text.heading,
      bg: "#D8DEE9",
    },
  };
}

export function renderExecutionHint(
  collapsed: boolean,
  palette: RendererPalette,
): string {
  const visibilityLabel = collapsed ? "Details hidden" : "Details visible";
  const actionLabel = collapsed ? "Enter expand" : "Enter collapse";

  return [
    "  ",
    colorize("│", palette.timeline.executionGuide),
    " ",
    colorize(visibilityLabel, palette.timeline.executionGuide, true),
    " ",
    colorize("·", palette.timeline.muted),
    " ",
    colorize(actionLabel, palette.timeline.hint),
  ].join("");
}

export function renderComposerMarkup(input: RenderComposerMarkupInput): string {
  if (input.draft.length === 0) {
    const placeholder = input.inputLocked
      ? "Generation in progress"
      : "Write a prompt...";

    return colorize(placeholder, input.palette.composer.placeholder);
  }

  const visibleLines = getVisibleComposerLines(input.draft, {
    maxVisibleLines: 4,
    maxLineWidth: input.maxLineWidth,
  }).map((line) =>
    colorize(line, input.palette.composer.text),
  );

  if (visibleLines.length === 0) {
    return "";
  }

  return visibleLines.join("\n");
}

export function renderCommandMenuMarkup(input: RenderCommandMenuMarkupInput): string {
  if (!input.visible) {
    return "";
  }

  if (input.items.length === 0) {
    return colorize("No matching commands.", input.palette.commandMenu.empty);
  }

  return input.items.map((item, index) => {
    const selected = index === input.selectedIndex;
    const marker = selected
      ? colorize(">", input.palette.commandMenu.selectedMarker, true)
      : colorize(" ", input.palette.commandMenu.muted);
    const name = colorize(
      item.name,
      selected ? input.palette.commandMenu.selectedText : input.palette.commandMenu.text,
      true,
    );
    const description = colorize(item.description, input.palette.commandMenu.description);

    return `${marker} ${name} ${description}`;
  }).join("\n");
}
