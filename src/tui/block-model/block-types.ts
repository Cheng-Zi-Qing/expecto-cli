import type { TextToken } from "./text-tokens.ts";

export type BlockKind = "paragraph" | "list" | "quote_block" | "code_block";

export type ParagraphBlock = {
  kind: "paragraph";
  tokens: TextToken[];
};

export type ListBlock = {
  kind: "list";
  ordered: boolean;
  items: TextToken[][];
};

export type QuoteBlock = {
  kind: "quote_block";
  tokens: TextToken[];
};

export type CodeBlock = {
  kind: "code_block";
  language?: string;
  code: string;
};

export type MarkdownBlock = ParagraphBlock | ListBlock | QuoteBlock | CodeBlock;
