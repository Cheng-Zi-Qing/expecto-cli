import type { MarkdownBlock } from "../block-model/block-types.ts";
import type { TimelineItem } from "../tui-types.ts";
import type {
  ThemeWelcomeBlock,
  TimelineCard,
  TimelineCardBlock,
  TranscriptBlock,
} from "../view-model/timeline-blocks.ts";
import { buildTimelineCards } from "../view-model/timeline-blocks.ts";
import { layoutRenderedCards, type RenderedTimelineLayout } from "./block-layout.ts";
import {
  type RendererPalette,
  renderExecutionHint,
  renderInlineTextTokens,
  styleText,
} from "./tui-theme.ts";

const USER_HEADER_LABEL = "Submitted Input";

type CardChrome = {
  title: string;
  accent: string;
  border: string;
  summary: string;
  body: string;
};

const BLOCK_INDENT = "  ";

function applyBackground(markup: string, bg: string): string {
  return `{${bg}-bg}${markup}{/${bg}-bg}`;
}

function cardChrome(card: TimelineCard, palette: RendererPalette): CardChrome {
  switch (card.kind) {
    case "user":
      return {
        title: USER_HEADER_LABEL,
        accent: palette.timeline.card.user.label,
        border: palette.timeline.card.user.border,
        summary: palette.timeline.card.user.summary,
        body: palette.timeline.card.user.body,
      };
    case "execution":
      return {
        title: card.headerLabel,
        accent: palette.timeline.card.execution.label,
        border: palette.timeline.card.execution.border,
        summary: palette.timeline.card.execution.summary,
        body: palette.timeline.card.execution.body,
      };
    case "system":
      return {
        title: card.headerLabel,
        accent: palette.timeline.card.system.label,
        border: palette.timeline.card.system.border,
        summary: palette.timeline.card.system.summary,
        body: palette.timeline.card.system.body,
      };
    case "welcome":
      return {
        title: card.headerLabel,
        accent: palette.timeline.card.welcome.label,
        border: palette.timeline.card.welcome.border,
        summary: palette.timeline.card.welcome.summary,
        body: palette.timeline.card.welcome.body,
      };
    case "assistant":
      return {
        title: card.headerLabel,
        accent: palette.timeline.card.assistant.label,
        border: palette.timeline.card.assistant.border,
        summary: palette.timeline.card.assistant.summary,
        body: palette.timeline.card.assistant.body,
      };
  }
}

function renderMarker(selected: boolean, palette: RendererPalette): string {
  if (selected) {
    return styleText(">", {
      fg: palette.timeline.selectedMarker,
      bold: true,
    });
  }

  return styleText(" ", {
    fg: palette.timeline.muted,
  });
}

function renderHeader(card: TimelineCard, palette: RendererPalette): string {
  const chrome = cardChrome(card, palette);
  const marker = renderMarker(card.selected, palette);
  const title = styleText(chrome.title, {
    fg: chrome.accent,
    bold: true,
  });
  const summary = styleText(card.summary, {
    fg: card.selected ? palette.timeline.selectedText : chrome.summary,
    bold: true,
  });

  if (card.kind === "user") {
    return `${marker} ${title}`;
  }

  return `${marker} ${title}: ${summary}`;
}

function renderLinesWithGuide(
  lines: string[],
  guideStyle: { fg: string; bg?: string },
): string[] {
  const guide = styleText("│", guideStyle);

  return lines.map((line) => `${BLOCK_INDENT}${guide} ${line}`);
}

function renderParagraphBlock(
  block: Extract<MarkdownBlock, { kind: "paragraph" }>,
  palette: RendererPalette,
): string[] {
  return renderInlineTextTokens(block.tokens, palette).split("\n").map((line) =>
    `${BLOCK_INDENT}${line}`
  );
}

function renderListBlock(
  block: Extract<MarkdownBlock, { kind: "list" }>,
  palette: RendererPalette,
): string[] {
  return block.items.flatMap((item, index) => {
    const bullet = block.ordered ? `${index + 1}.` : "•";
    const rendered = renderInlineTextTokens(item, palette).split("\n");

    return rendered.map((line, lineIndex) => {
      const prefix = lineIndex === 0 ? `${bullet} ` : "  ";
      return `${BLOCK_INDENT}${styleText(prefix, {
        fg: palette.timeline.card.assistant.label,
        bold: lineIndex === 0,
      })}${line}`;
    });
  });
}

function renderQuoteBlock(
  block: Extract<MarkdownBlock, { kind: "quote_block" }>,
  palette: RendererPalette,
): string[] {
  return renderLinesWithGuide(
    renderInlineTextTokens(block.tokens, palette).split("\n"),
    {
      fg: palette.timeline.card.execution.label,
    },
  );
}

function renderCodeBlock(
  block: Extract<MarkdownBlock, { kind: "code_block" }>,
  palette: RendererPalette,
): string[] {
  const language = block.language
    ? styleText(block.language, {
        fg: palette.timeline.card.execution.label,
        bold: true,
      })
    : styleText("code", {
        fg: palette.timeline.muted,
        bold: true,
      });
  const codeLines = block.code.length === 0 ? [""] : block.code.split("\n");
  const framed = [
    `${BLOCK_INDENT}${styleText("╭─ ", { fg: palette.timeline.card.assistant.border })}${language}`,
    ...renderLinesWithGuide(
      codeLines.map((line) =>
        styleText(line, {
          fg: palette.timeline.card.assistant.body,
        })
      ),
      {
        fg: palette.timeline.card.assistant.border,
      },
    ),
    `${BLOCK_INDENT}${styleText("╰", { fg: palette.timeline.card.assistant.border })}`,
  ];

  return framed;
}

function renderTranscriptBlock(
  block: TranscriptBlock,
  palette: RendererPalette,
): string[] {
  return renderLinesWithGuide(
    block.lines.map((line) =>
      styleText(line, {
        fg: palette.timeline.card.execution.body,
        bg: palette.timeline.card.execution.transcriptBg,
      })
    ),
    {
      fg: palette.timeline.executionGuide,
      bg: palette.timeline.card.execution.transcriptBg,
    },
  );
}

function renderThemeWelcome(
  block: ThemeWelcomeBlock,
  palette: RendererPalette,
): string[] {
  const glyphLines = block.glyphRows.map((row) =>
    `${BLOCK_INDENT}${row.map((segment) =>
      styleText(segment.text, {
        fg: palette.timeline.glyph[segment.color],
        bold: segment.color === "chin" || segment.color === "highlight",
      })
    ).join("")}`,
  );
  const highlightLine = block.highlightTokens.map((token) =>
    renderInlineTextTokens([{ kind: token.kind, text: token.text }], palette)
  ).join(` ${styleText("·", { fg: palette.timeline.muted })} `);

  return [
    styleText(block.title, {
      fg: palette.timeline.card.welcome.summary,
      bold: true,
    }),
    styleText(block.subtitle, {
      fg: palette.timeline.card.welcome.body,
    }),
    "",
    ...glyphLines,
    "",
    styleText(block.tipTitle, {
      fg: palette.timeline.card.welcome.label,
      bold: true,
    }),
    styleText(block.tipText, {
      fg: palette.timeline.card.welcome.body,
    }),
    "",
    styleText(block.highlightTitle, {
      fg: palette.timeline.card.welcome.label,
      bold: true,
    }),
    highlightLine,
  ].map((line) => (line.length > 0 ? `${BLOCK_INDENT}${line}` : ""));
}

function renderBlock(
  block: TimelineCardBlock,
  palette: RendererPalette,
): string[] {
  switch (block.kind) {
    case "paragraph":
      return renderParagraphBlock(block, palette);
    case "list":
      return renderListBlock(block, palette);
    case "quote_block":
      return renderQuoteBlock(block, palette);
    case "code_block":
      return renderCodeBlock(block, palette);
    case "transcript_block":
      return renderTranscriptBlock(block, palette);
    case "theme_welcome":
      return renderThemeWelcome(block, palette);
    case "badge_row":
      return [
        `${BLOCK_INDENT}${block.badges.map((badge) =>
          styleText(badge, {
            fg: palette.timeline.card.system.label,
            bold: true,
          })
        ).join(` ${styleText("·", { fg: palette.timeline.muted })} `)}`,
      ];
  }
}

function renderUserCard(card: TimelineCard, palette: RendererPalette): string {
  const chrome = cardChrome(card, palette);
  const bodyLines = card.blocks.flatMap((block) => {
    if (block.kind !== "paragraph") {
      return renderBlock(block, palette);
    }

    return renderInlineTextTokens(block.tokens, palette).split("\n").map((line) =>
      `${styleText("│", { fg: chrome.border, bg: palette.timeline.card.user.bg })}${
        applyBackground(` ${line}`, palette.timeline.card.user.bg)
      }`
    );
  });
  const top = `${BLOCK_INDENT}${styleText("╭", {
    fg: chrome.border,
    bg: palette.timeline.card.user.bg,
  })}${styleText("─", { fg: chrome.border, bg: palette.timeline.card.user.bg }).repeat(2)}`;
  const bottom = `${BLOCK_INDENT}${styleText("╰", {
    fg: chrome.border,
    bg: palette.timeline.card.user.bg,
  })}`;

  return [
    renderHeader(card, palette),
    top,
    ...bodyLines.map((line) => `${BLOCK_INDENT}${line}`),
    bottom,
  ].join("\n");
}

export function renderTimelineCardMarkup(
  card: TimelineCard,
  palette: RendererPalette,
): string {
  if (card.kind === "welcome") {
    return card.blocks.flatMap((block) => renderBlock(block, palette)).join("\n");
  }

  if (card.kind === "user") {
    return renderUserCard(card, palette);
  }

  const lines = [renderHeader(card, palette)];

  if (card.kind === "execution") {
    lines.push("");
    lines.push(renderExecutionHint(card.collapsed, palette));
  }

  if (card.blocks.length > 0) {
    lines.push("");
    lines.push(...card.blocks.flatMap((block) => renderBlock(block, palette)));
  }

  return lines.join("\n");
}

function renderTimelineCards(
  cards: TimelineCard[],
  palette: RendererPalette,
  options?: {
    wrapWidth?: number;
  },
): RenderedTimelineLayout {
  const rendered = cards.map((card) => renderTimelineCardMarkup(card, palette));
  const selectedIndex = cards.findIndex((card) => card.selected);

  return layoutRenderedCards(
    rendered,
    selectedIndex >= 0 ? selectedIndex : 0,
    options,
  );
}

export function renderTimelineItems(
  timeline: TimelineItem[],
  selectedIndex: number,
  palette: RendererPalette,
  options?: {
    wrapWidth?: number;
  },
): RenderedTimelineLayout {
  return renderTimelineCards(
    buildTimelineCards(timeline, selectedIndex),
    palette,
    options,
  );
}
