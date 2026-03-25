import type { MarkdownBlock } from "../block-model/block-types.ts";
import type { TextToken } from "../block-model/text-tokens.ts";
import type {
  TuiTranscriptBlock,
  TuiTranscriptContentBlock,
  TuiTranscriptView,
} from "../view-model/tui-view-types.ts";
import { wrapPlainText } from "./text-layout.ts";

export type TranscriptViewport = {
  width: number;
  height: number;
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
  const lines: string[] = [`${card.headerLabel}: ${card.summary}`];

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

export function renderTranscript(view: TuiTranscriptView, viewport: TranscriptViewport): string[] {
  const width = Number.isFinite(viewport.width) && viewport.width > 0
    ? Math.floor(viewport.width)
    : 1;
  const rendered = view.blocks.flatMap((card) => renderCard(card, width));

  if (!Number.isFinite(viewport.height) || viewport.height <= 0) {
    return [];
  }

  const height = Math.floor(viewport.height);
  return rendered.slice(-height);
}
