import type { MarkdownBlock } from "../block-model/block-types.ts";
import type { TextToken } from "../block-model/text-tokens.ts";
import type {
  TuiTranscriptBlock,
  TuiTranscriptContentBlock,
  TuiThemePickerOverlayView,
  TuiTranscriptView,
} from "../view-model/tui-view-types.ts";
import {
  charDisplayWidth,
  padOrTrimToWidth,
  textDisplayWidth,
  wrapPlainText,
} from "./text-layout.ts";

const USER_HEADER_LABEL = "Submitted Input";
const FRAME_SIDE_WIDTH = 4;

type RgbColor = [number, number, number];

type AnsiStyle = {
  fg?: RgbColor;
  bg?: RgbColor;
  bold?: boolean;
  dim?: boolean;
};

type TokenCharacter = {
  kind: TextToken["kind"];
  char: string;
};

export type TranscriptViewport = {
  width: number;
  height: number;
};

export type RenderedTranscriptLayout = {
  lines: string[];
  itemStartLines: number[];
  selectedLine: number;
  topLine: number;
};

export type TranscriptDiff =
  | {
    mode: "append";
    lines: string[];
  }
  | {
    mode: "replay";
    lines: string[];
  };

type ThemeWelcomeRenderOptions = {
  centerGlyph: boolean;
};

function renderTokens(tokens: TextToken[]): string {
  return tokens.map((token) => token.text).join("");
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t";
}

function createAnsiOpen(style: AnsiStyle): string {
  const codes: number[] = [];

  if (style.bold) {
    codes.push(1);
  }

  if (style.dim) {
    codes.push(2);
  }

  if (style.fg) {
    codes.push(38, 2, ...style.fg);
  }

  if (style.bg) {
    codes.push(48, 2, ...style.bg);
  }

  return codes.length === 0 ? "" : `\u001b[${codes.join(";")}m`;
}

function styleText(text: string, style: AnsiStyle): string {
  const open = createAnsiOpen(style);

  if (open === "" || text.length === 0) {
    return text;
  }

  return `${open}${text}\u001b[0m`;
}

function hexToRgb(hex: string): RgbColor {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;

  if (normalized.length !== 6) {
    return [255, 255, 255];
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function chromeStyleFor(card: TuiTranscriptBlock, view: TuiTranscriptView): AnsiStyle {
  switch (card.kind) {
    case "user":
      return {
        fg: hexToRgb(view.theme.palette.chrome.user),
        bold: true,
      };
    case "assistant":
      return {
        fg: hexToRgb(view.theme.palette.chrome.assistant),
        bold: true,
      };
    case "welcome":
    case "system":
    case "execution":
      return {
        fg: hexToRgb(view.theme.palette.chrome.utility),
        bold: true,
      };
  }
}

function tokenStyleFor(token: TextToken, view: TuiTranscriptView): AnsiStyle | null {
  switch (token.kind) {
    case "default":
      return null;
    case "muted":
      return {
        fg: hexToRgb(view.theme.palette.text.muted),
        dim: true,
      };
    case "inline_code":
      return {
        fg: hexToRgb(view.theme.palette.token.inlineCodeFg),
        bg: hexToRgb(view.theme.palette.token.inlineCodeBg),
      };
    case "command":
      return {
        fg: hexToRgb(view.theme.palette.token.command),
        bold: true,
      };
    case "path":
      return {
        fg: hexToRgb(view.theme.palette.token.path),
      };
    case "shortcut":
      return {
        fg: hexToRgb(view.theme.palette.token.shortcut),
        bold: true,
      };
    case "status":
      return {
        fg: hexToRgb(view.theme.palette.token.status),
        bold: true,
      };
  }
}

function renderStyledTokens(tokens: TextToken[], view: TuiTranscriptView): string {
  return tokens.map((token) => {
    const style = tokenStyleFor(token, view);
    return style ? styleText(token.text, style) : token.text;
  }).join("");
}

function splitTokenLines(tokens: TextToken[]): TextToken[][] {
  const lines: TextToken[][] = [[]];

  for (const token of tokens) {
    const segments = token.text.split("\n");

    segments.forEach((segment, index) => {
      if (segment.length > 0) {
        lines[lines.length - 1]?.push({
          ...token,
          text: segment,
        });
      }

      if (index < segments.length - 1) {
        lines.push([]);
      }
    });
  }

  return lines;
}

function tokenLineToCharacters(tokens: TextToken[]): TokenCharacter[] {
  const characters: TokenCharacter[] = [];

  for (const token of tokens) {
    for (const char of Array.from(token.text)) {
      characters.push({
        kind: token.kind,
        char,
      });
    }
  }

  return characters;
}

function charactersToTokens(characters: TokenCharacter[]): TextToken[] {
  const tokens: TextToken[] = [];

  for (const character of characters) {
    const last = tokens.at(-1);

    if (last && last.kind === character.kind) {
      last.text += character.char;
      continue;
    }

    tokens.push({
      kind: character.kind,
      text: character.char,
    });
  }

  return tokens;
}

function wrapTokenLine(tokens: TextToken[], width: number): TextToken[][] {
  const normalizedWidth = Number.isFinite(width) && width > 0 ? Math.floor(width) : 1;
  const characters = tokenLineToCharacters(tokens);

  if (characters.length === 0) {
    return [[]];
  }

  const wrapped: TextToken[][] = [];
  let start = 0;

  while (start < characters.length) {
    let hardEnd = start;
    let consumedWidth = 0;

    while (hardEnd < characters.length) {
      const nextWidth = charDisplayWidth(characters[hardEnd]?.char ?? "");

      if (hardEnd > start && consumedWidth + nextWidth > normalizedWidth) {
        break;
      }

      consumedWidth += nextWidth;
      hardEnd += 1;

      if (consumedWidth >= normalizedWidth) {
        break;
      }
    }

    if (hardEnd === characters.length) {
      wrapped.push(charactersToTokens(characters.slice(start)));
      break;
    }

    let splitAt = -1;
    for (let index = hardEnd - 1; index > start; index -= 1) {
      if (isWhitespace(characters[index]?.char ?? "")) {
        splitAt = index;
        break;
      }
    }

    if (splitAt !== -1) {
      wrapped.push(charactersToTokens(characters.slice(start, splitAt)));
      start = splitAt;
      continue;
    }

    wrapped.push(charactersToTokens(characters.slice(start, hardEnd)));
    start = hardEnd;
  }

  return wrapped;
}

function wrapTokenLines(tokens: TextToken[], width: number): TextToken[][] {
  return splitTokenLines(tokens).flatMap((line) => wrapTokenLine(line, width));
}

function buildThemeHighlightTokens(
  block: Extract<TuiTranscriptContentBlock, { kind: "theme_welcome" }>,
): TextToken[] {
  return block.highlightTokens.flatMap((token, index) => {
    const tokens: TextToken[] = [];

    if (index > 0) {
      tokens.push({
        kind: "muted",
        text: " · ",
      });
    }

    tokens.push({
      kind: token.kind,
      text: token.text,
    });

    return tokens;
  });
}

function renderMarkdownBlock(
  block: MarkdownBlock,
  width: number,
  view: TuiTranscriptView,
): string[] {
  switch (block.kind) {
    case "paragraph":
      return wrapTokenLines(block.tokens, width).map((tokens) => renderStyledTokens(tokens, view));
    case "list":
      return block.items.flatMap((item, index) => {
        const marker = block.ordered ? `${index + 1}.` : "-";
        return wrapTokenLines(
          [
            { kind: "default", text: `${marker} ` },
            ...item,
          ],
          width,
        ).map((tokens) => renderStyledTokens(tokens, view));
      });
    case "quote_block":
      return wrapTokenLines(
        [
          { kind: "default", text: "> " },
          ...block.tokens,
        ],
        width,
      ).map((tokens) => renderStyledTokens(tokens, view));
    case "code_block":
      if (block.language !== undefined && block.language.length > 0) {
        return [
          `\`\`\`${block.language}`,
          ...block.code.split("\n").flatMap((line) => wrapPlainText(line, width)),
          "```",
        ];
      }
      return ["```", ...block.code.split("\n").flatMap((line) => wrapPlainText(line, width)), "```"];
  }
}

function renderThemeWelcomeBlock(
  block: Extract<TuiTranscriptContentBlock, { kind: "theme_welcome" }>,
  width: number,
  view: TuiTranscriptView,
  options: ThemeWelcomeRenderOptions = { centerGlyph: false },
): string[] {
  const glyphLines = block.glyphRows.map((row) => {
    const rendered = row.map((segment) =>
      styleText(segment.text, {
        fg: hexToRgb(view.theme.palette.glyph[segment.color]),
        bold: segment.color === "chin" || segment.color === "highlight",
      })
    ).join("");
    const raw = row.map((segment) => segment.text).join("");

    if (!options.centerGlyph) {
      return rendered;
    }

    return `${" ".repeat(Math.max(0, Math.floor((width - textDisplayWidth(raw)) / 2)))}${rendered}`;
  });
  const highlightLines = wrapTokenLines(buildThemeHighlightTokens(block), width).map((tokens) =>
    renderStyledTokens(tokens, view)
  );

  return [
    styleText(block.title, {
      fg: hexToRgb(view.theme.palette.text.heading),
      bold: true,
    }),
    ...wrapPlainText(block.subtitle, width).map((line) =>
      styleText(line, {
        fg: hexToRgb(view.theme.palette.text.body),
      })
    ),
    "",
    ...glyphLines,
    "",
    styleText(block.tipTitle, {
      fg: hexToRgb(view.theme.palette.chrome.utility),
      bold: true,
    }),
    ...wrapPlainText(block.tipText, width).map((line) =>
      styleText(line, {
        fg: hexToRgb(view.theme.palette.text.body),
      })
    ),
    "",
    styleText(block.highlightTitle, {
      fg: hexToRgb(view.theme.palette.chrome.utility),
      bold: true,
    }),
    ...highlightLines,
  ];
}

function renderContentBlock(
  block: TuiTranscriptContentBlock,
  width: number,
  view: TuiTranscriptView,
): string[] {
  switch (block.kind) {
    case "transcript_block":
      return block.lines.flatMap((line) => wrapPlainText(line, width));
    case "badge_row":
      return wrapPlainText(block.badges.join(" · "), width);
    case "theme_welcome":
      return renderThemeWelcomeBlock(block, width, view);
    case "paragraph":
    case "list":
    case "quote_block":
    case "code_block":
      return renderMarkdownBlock(block, width, view);
  }
}

function renderLabeledFrameLine(
  width: number,
  leftCorner: string,
  rightCorner: string,
  label: string,
): string {
  if (width <= 0) {
    return "";
  }

  if (width === 1) {
    return leftCorner;
  }

  const innerWidth = Math.max(0, width - 2);
  const visibleLabel = label.slice(0, innerWidth);
  const fillerWidth = Math.max(0, innerWidth - visibleLabel.length);

  return `${leftCorner}${visibleLabel}${"─".repeat(fillerWidth)}${rightCorner}`;
}

function renderFramedBodyLine(content: string, width: number): string {
  if (width < FRAME_SIDE_WIDTH) {
    return padOrTrimToWidth(content, width);
  }

  const contentWidth = Math.max(1, width - FRAME_SIDE_WIDTH);
  return `│ ${padOrTrimToWidth(content, contentWidth)} │`;
}

function renderRailBodyLine(
  card: TuiTranscriptBlock,
  content: string,
  view: TuiTranscriptView,
): string {
  return `${styleText("│ ", chromeStyleFor(card, view))}${content}`;
}

function renderCardBodyLines(
  card: TuiTranscriptBlock,
  width: number,
  view: TuiTranscriptView,
): string[] {
  if (width <= 0) {
    return [];
  }

  if (card.kind === "execution" && card.collapsed) {
    return ["Details hidden"];
  }

  const lines: string[] = [];

  for (const block of card.blocks) {
    for (const line of renderContentBlock(block, width, view)) {
      lines.push(line);
    }
  }

  return lines;
}

function renderCard(
  card: TuiTranscriptBlock,
  width: number,
  view: TuiTranscriptView,
): string[] {
  if (card.kind === "welcome") {
    return renderCardBodyLines(card, width, view);
  }

  if (card.kind === "user") {
    const contentWidth = width < FRAME_SIDE_WIDTH ? width : Math.max(1, width - FRAME_SIDE_WIDTH);
    const bodyLines = renderCardBodyLines(card, contentWidth, view);

    return [
      styleText(renderLabeledFrameLine(width, "╭", "╮", ` ${USER_HEADER_LABEL} `), chromeStyleFor(card, view)),
      ...bodyLines.map((line) => styleText(renderFramedBodyLine(line, width), chromeStyleFor(card, view))),
      styleText(renderLabeledFrameLine(width, "╰", "╯", ""), chromeStyleFor(card, view)),
    ];
  }

  if (card.kind === "system") {
    const bodyLines = renderCardBodyLines(card, width, view);

    if (bodyLines.length === 0) {
      return [""];
    }

    return bodyLines;
  }

  if (card.kind === "execution") {
    const header = styleText(
      padOrTrimToWidth(`${card.headerLabel}: ${card.summary}`, width),
      chromeStyleFor(card, view),
    );
    const bodyLines = renderCardBodyLines(card, width, view);

    return [header, ...bodyLines];
  }

  if (card.kind === "assistant") {
    const header = styleText(
      padOrTrimToWidth(`${card.headerLabel}:`, width),
      chromeStyleFor(card, view),
    );
    const contentWidth = Math.max(1, width - 2);
    const bodyLines = renderCardBodyLines(card, contentWidth, view);

    return [header, ...bodyLines.map((line) => renderRailBodyLine(card, line, view))];
  }

  const header = styleText(
    padOrTrimToWidth(`${card.headerLabel}: ${card.summary}`, width),
    chromeStyleFor(card, view),
  );
  const contentWidth = Math.max(1, width - 2);
  const bodyLines = renderCardBodyLines(card, contentWidth, view);

  return [header, ...bodyLines.map((line) => renderRailBodyLine(card, line, view))];
}

function resolveSelectedIndex(view: TuiTranscriptView): number {
  const selectedIndex = view.blocks.findIndex((card) => card.selected);

  if (selectedIndex !== -1) {
    return selectedIndex;
  }

  return Math.max(0, view.blocks.length - 1);
}

function resolveViewportTopLine(totalLines: number, height: number, selectedLine: number): number {
  if (totalLines <= height) {
    return 0;
  }

  return Math.max(0, Math.min(selectedLine, totalLines - height));
}

export function renderTranscriptLayout(
  view: TuiTranscriptView,
  viewport: TranscriptViewport,
): RenderedTranscriptLayout {
  const width = Number.isFinite(viewport.width) && viewport.width > 0
    ? Math.floor(viewport.width)
    : 1;

  if (!Number.isFinite(viewport.height) || viewport.height <= 0) {
    return {
      lines: [],
      itemStartLines: [],
      selectedLine: 0,
      topLine: 0,
    };
  }

  const height = Math.floor(viewport.height);
  const renderedCards = view.blocks.map((card) => renderCard(card, width, view));
  const itemStartLines: number[] = [];
  const rendered: string[] = [];

  for (const cardLines of renderedCards) {
    itemStartLines.push(rendered.length);
    rendered.push(...cardLines);
  }

  const selectedIndex = Math.max(
    0,
    Math.min(resolveSelectedIndex(view), Math.max(0, itemStartLines.length - 1)),
  );
  const selectedAbsoluteLine = itemStartLines[selectedIndex] ?? Math.max(0, rendered.length - 1);
  const topLine = resolveViewportTopLine(rendered.length, height, selectedAbsoluteLine);

  return {
    lines: rendered.slice(topLine, topLine + height),
    itemStartLines,
    selectedLine: Math.max(0, selectedAbsoluteLine - topLine),
    topLine,
  };
}

export function renderTranscriptLines(view: TuiTranscriptView, width: number): string[] {
  const normalizedWidth = Number.isFinite(width) && width > 0 ? Math.floor(width) : 1;
  return view.blocks.flatMap((card) => renderCard(card, normalizedWidth, view));
}

export function diffTranscriptLines(previous: string[], next: string[]): TranscriptDiff {
  const isAppendOnly =
    next.length >= previous.length && previous.every((line, index) => next[index] === line);

  if (isAppendOnly) {
    return {
      mode: "append",
      lines: next.slice(previous.length),
    };
  }

  return {
    mode: "replay",
    lines: next,
  };
}

export function renderTranscript(view: TuiTranscriptView, viewport: TranscriptViewport): string[] {
  return renderTranscriptLayout(view, viewport).lines;
}

export function renderThemePickerOverlay(
  overlay: TuiThemePickerOverlayView,
  width: number,
): string[] {
  const normalizedWidth = Number.isFinite(width) && width > 0 ? Math.floor(width) : 1;
  const compactLabels = normalizedWidth <= 96;
  const leftWidth = compactLabels
    ? Math.max(14, Math.min(18, Math.floor(normalizedWidth * 0.22)))
    : Math.max(24, Math.min(36, Math.floor(normalizedWidth * 0.38)));
  const separator = "  ";
  const rightWidth = Math.max(20, normalizedWidth - leftWidth - separator.length);
  const leftLines = overlay.entries.map((entry) => {
    const plannedLabel = entry.availability === "planned" && !compactLabels ? " · planned" : "";
    const labelText = compactLabels
      ? entry.displayName
      : `${entry.displayName} · ${entry.animal} · ${entry.paletteLabel}${plannedLabel}`;
    const label = padOrTrimToWidth(
      labelText,
      Math.max(1, leftWidth - 2),
    );
    const marker = entry.selected
      ? styleText(">", {
          fg: hexToRgb(overlay.sampleTheme.palette.chrome.selection),
          bold: true,
        })
      : " ";

    if (!entry.selected) {
      return `${marker} ${label}`;
    }

    return `${marker} ${styleText(label, {
      fg: hexToRgb(overlay.sampleTheme.palette.text.selected),
      bold: true,
    })}`;
  });
  const rightLines = renderThemeWelcomeBlock(
    {
      kind: "theme_welcome",
      title: overlay.sampleTheme.welcome.title,
      subtitle: overlay.sampleTheme.welcome.subtitle,
      glyphRows: overlay.sampleTheme.welcome.glyphRows,
      tipTitle: overlay.sampleTheme.sample.tipTitle,
      tipText: overlay.sampleTheme.sample.tipText,
      highlightTitle: overlay.sampleTheme.sample.highlightTitle,
      highlightTokens: overlay.sampleTheme.sample.highlightTokens,
    },
    rightWidth,
    {
      theme: {
        id: overlay.sampleTheme.id,
        palette: overlay.sampleTheme.palette,
      },
      blocks: [],
    },
    {
      centerGlyph: compactLabels,
    },
  );

  const lineCount = Math.max(leftLines.length, rightLines.length);

  return Array.from({ length: lineCount }, (_value, index) => {
    const left = leftLines[index] ?? " ".repeat(leftWidth);
    const right = rightLines[index] ?? "";

    return `${left}${separator}${right}`.trimEnd();
  });
}
