import type { MarkdownBlock } from "../block-model/block-types.ts";
import type { TextToken } from "../block-model/text-tokens.ts";
import type {
  TuiTranscriptBlock,
  TuiTranscriptContentBlock,
  TuiTranscriptView,
} from "../view-model/tui-view-types.ts";
import { wrapPlainText } from "./text-layout.ts";

const USER_HEADER_LABEL = "Submitted Input";

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

function renderTokens(tokens: TextToken[]): string {
  return tokens.map((token) => token.text).join("");
}

function renderMarkdownBlock(block: MarkdownBlock): string[] {
  switch (block.kind) {
    case "paragraph":
      return [renderTokens(block.tokens)];
    case "list":
      return block.items.map((item, index) => {
        const marker = block.ordered ? `${index + 1}.` : "-";
        return `${marker} ${renderTokens(item)}`;
      });
    case "quote_block":
      return [`> ${renderTokens(block.tokens)}`];
    case "code_block":
      if (block.language !== undefined && block.language.length > 0) {
        return [`\`\`\`${block.language}`, ...block.code.split("\n"), "```"];
      }
      return ["```", ...block.code.split("\n"), "```"];
  }
}

function renderContentBlock(block: TuiTranscriptContentBlock): string[] {
  switch (block.kind) {
    case "transcript_block":
      return block.lines;
    case "badge_row":
      return [block.badges.join(" · ")];
    case "paragraph":
    case "list":
    case "quote_block":
    case "code_block":
      return renderMarkdownBlock(block);
  }
}

function renderCard(card: TuiTranscriptBlock, width: number): string[] {
  const header =
    card.kind === "user"
      ? USER_HEADER_LABEL
      : `${card.headerLabel}: ${card.summary}`;
  const lines: string[] = [header];

  if (card.kind === "execution" && card.collapsed) {
    lines.push("Details hidden");
    return lines.flatMap((line) => wrapPlainText(line, width));
  }

  for (const block of card.blocks) {
    for (const line of renderContentBlock(block)) {
      lines.push(`  ${line}`);
    }
  }

  return lines.flatMap((line) => wrapPlainText(line, width));
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
  const renderedCards = view.blocks.map((card) => renderCard(card, width));
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
  return view.blocks.flatMap((card) => renderCard(card, normalizedWidth));
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
