import blessed from "neo-blessed";

import type { TextToken } from "../block-model/text-tokens.ts";
import type { CommandMenuState, TuiFocus } from "../tui-types.ts";

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
};

type RenderComposerMarkupInput = {
  draft: string;
  inputLocked: boolean;
  palette: RendererPalette;
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
  return {
    timeline: {
      text: "#111827",
      body: "#1F2937",
      muted: "#6B7280",
      guide: "#4B5563",
      hint: "#374151",
      bg: "#F8FAFC",
      border: input.focus === "timeline" ? "#D9A93D" : "#4B5563",
      label: "#F6C760",
      card: {
        welcome: {
          border: "#D4AF37",
          label: "#B7791F",
          summary: "#111827",
          body: "#1F2937",
        },
        system: {
          border: "#D4AF37",
          label: "#B7791F",
          summary: "#111827",
          body: "#1F2937",
        },
        user: {
          border: "#4FAF7C",
          label: "#4FAF7C",
          summary: "#111827",
          body: "#1F2937",
        },
        assistant: {
          border: "#CBD5E1",
          label: "#111827",
          summary: "#111827",
          body: "#1F2937",
        },
        execution: {
          border: "#B7791F",
          label: "#B7791F",
          summary: "#111827",
          body: "#1F2937",
          transcriptBg: "#F3F4F6",
        },
      },
      token: {
        default: {
          fg: "#1F2937",
        },
        muted: {
          fg: "#6B7280",
        },
        inlineCode: {
          fg: "#F8FAFC",
          bg: "#111827",
        },
        command: {
          fg: "#2563EB",
        },
        path: {
          fg: "#4FAF7C",
        },
        shortcut: {
          fg: "#7C3AED",
        },
        status: {
          fg: "#B7791F",
        },
      },
      executionGuide: "#B7791F",
      selectedMarker: "#2563EB",
      selectedText: "#111827",
    },
    composer: {
      text: "#1F2937",
      border: input.focus === "composer" ? "#4FAF7C" : "#4B5563",
      label: "#4FAF7C",
      placeholder: "#6B7280",
      cursor: input.inputLocked ? "#F6C760" : "#4FAF7C",
      bg: "#F3F4F6",
    },
    commandMenu: {
      text: "#4FAF7C",
      description: "#4B5563",
      muted: "#6B7280",
      empty: "#6B7280",
      border: "#4B5563",
      label: "#4FAF7C",
      bg: "#EEF2F7",
      selectedMarker: "#2563EB",
      selectedText: "#111827",
    },
    inspector: {
      text: "#1F2937",
      border: "#4B5563",
      bg: "#F3F4F6",
    },
    statusBar: {
      fg: "#111827",
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

  const lines = input.draft.split("\n");
  const visibleLines = lines.slice(-4).map((line) =>
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
