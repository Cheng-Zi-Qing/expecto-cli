import type {
  CodeBlock,
  MarkdownBlock,
} from "../block-model/block-types.ts";
import type { TextToken } from "../block-model/text-tokens.ts";
import { createTextToken } from "../block-model/text-tokens.ts";

type ListInfo = {
  ordered: boolean;
  text: string;
};

const LIST_PATTERNS = [
  { ordered: true, regex: /^(\d+)\.\s+(.*)$/ },
  { ordered: false, regex: /^([-+*])\s+(.*)$/ },
];

const trimEnding = (text: string): string => text.trimEnd();

const tokenizeInline = (text: string): TextToken[] => {
  const tokens: TextToken[] = [];
  let buffer = "";
  let index = 0;

  const readBacktickRun = (start: number): number => {
    let count = 0;
    while (start + count < text.length && text[start + count] === "`") {
      count += 1;
    }
    return count;
  };


  const flushBuffer = () => {
    if (buffer) {
      tokens.push(createTextToken("default", buffer));
      buffer = "";
    }
  };

  while (index < text.length) {
    if (text[index] === "`") {
      const backtickCount = readBacktickRun(index);
      if (backtickCount > 1) {
        buffer += "`".repeat(backtickCount);
        index += backtickCount;
        continue;
      }
      flushBuffer();
      const closing = text.indexOf("`", index + 1);
      if (closing === -1) {
        buffer += text[index];
        index += 1;
        continue;
      }
      const code = text.slice(index + 1, closing);
      tokens.push(createTextToken("inline_code", code));
      index = closing + 1;
      continue;
    }
    buffer += text[index];
    index += 1;
  }

  flushBuffer();
  return tokens;
};

const parseListLine = (line: string): ListInfo | null => {
  for (const candidate of LIST_PATTERNS) {
    const match = line.match(candidate.regex);
    if (!match) {
      continue;
    }
    const text = match[match.length - 1];
    if (text === undefined) {
      continue;
    }
    return { ordered: candidate.ordered, text };
  }
  return null;
};

const parseCodeBlock = (
  lines: string[],
  startIndex: number,
): { block: MarkdownBlock; nextIndex: number } | null => {
  const rawLine = lines[startIndex];
  if (!rawLine) {
    return null;
  }
  const startLine = rawLine.trim();
  if (!startLine.startsWith("```")) {
    return null;
  }

  const rawLanguage = trimEnding(startLine.slice(3)).trim();
  const language = rawLanguage === "" ? undefined : rawLanguage;
  const buffer: string[] = [];
  let cursor = startIndex + 1;
  let closed = false;

  while (cursor < lines.length) {
    const candidate = lines[cursor];
    if (candidate === undefined) {
      break;
    }
    if (candidate.trim() === "```") {
      cursor += 1;
      closed = true;
      break;
    }
    buffer.push(candidate);
    cursor += 1;
  }

  if (!closed) {
    return null;
  }

  const block: CodeBlock = {
    kind: "code_block",
    code: buffer.join("\n"),
  };

  if (language) {
    block.language = language;
  }

  return {
    block,
    nextIndex: cursor,
  };
};

const isParagraphBreak = (line: string): boolean => line.trim() === "";

const hasClosingFence = (lines: string[], startIndex: number): boolean => {
  let cursor = startIndex + 1;
  while (cursor < lines.length) {
    const candidate = lines[cursor];
    if (candidate === undefined) {
      cursor += 1;
      continue;
    }
    if (candidate.trim() === "```") {
      return true;
    }
    cursor += 1;
  }
  return false;
};

const parseQuoteBlock = (
  lines: string[],
  startIndex: number,
): { block: MarkdownBlock; nextIndex: number } | null => {
  const startLine = lines[startIndex];
  if (!startLine) {
    return null;
  }
  const firstTrimmed = startLine.trim();
  if (!firstTrimmed.startsWith(">")) {
    return null;
  }

  const quoteLines: string[] = [];
  let cursor = startIndex;

  while (cursor < lines.length) {
    const candidateLine = lines[cursor];
    if (!candidateLine) {
      break;
    }
    const candidate = candidateLine.trim();
    if (!candidate.startsWith(">")) {
      break;
    }
    const content = candidate.slice(1).replace(/^\s?/, "");
    quoteLines.push(content);
    cursor += 1;
  }

  return {
    block: {
      kind: "quote_block",
      tokens: tokenizeInline(quoteLines.join("\n")),
    },
    nextIndex: cursor,
  };
};

const parseListBlock = (
  lines: string[],
  startIndex: number,
): { block: MarkdownBlock; nextIndex: number } | null => {
  const firstLine = lines[startIndex];
  if (!firstLine) {
    return null;
  }
  const firstTrimmed = firstLine.trim();
  const initial = parseListLine(firstTrimmed);
  if (!initial) {
    return null;
  }

  const items: TextToken[][] = [];
  let cursor = startIndex;

  while (cursor < lines.length) {
    const line = lines[cursor];
    if (!line) {
      break;
    }
    const trimmed = line.trim();
    const listInfo = parseListLine(trimmed);
    if (!listInfo || listInfo.ordered !== initial.ordered) {
      break;
    }
    items.push(tokenizeInline(listInfo.text));
    cursor += 1;
  }

  return {
    block: {
      kind: "list",
      ordered: initial.ordered,
      items,
    },
    nextIndex: cursor,
  };
};

const parseParagraphBlock = (
  lines: string[],
  startIndex: number,
): { block: MarkdownBlock; nextIndex: number } | null => {
  const paragraphLines: string[] = [];
  let cursor = startIndex;

  while (cursor < lines.length) {
    const currentLine = lines[cursor];
    if (!currentLine) {
      break;
    }
    const trimmed = currentLine.trim();
    if (
      isParagraphBreak(currentLine) ||
      (trimmed.startsWith("```") && hasClosingFence(lines, cursor)) ||
      trimmed.startsWith(">") ||
      Boolean(parseListLine(trimmed))
    ) {
      break;
    }

    paragraphLines.push(currentLine);
    cursor += 1;
  }

  if (paragraphLines.length === 0) {
    return null;
  }

  return {
    block: {
      kind: "paragraph",
      tokens: tokenizeInline(paragraphLines.join("\n")),
    },
    nextIndex: cursor,
  };
};

export function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const normalized = source.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks: MarkdownBlock[] = [];

  let cursor = 0;
  while (cursor < lines.length) {
    const current = lines[cursor];
    if (!current) {
      cursor += 1;
      continue;
    }
    if (current.trim() === "") {
      cursor += 1;
      continue;
    }

    const handlers = [
      parseCodeBlock,
      parseListBlock,
      parseQuoteBlock,
      parseParagraphBlock,
    ];

    let consumed = false;
    for (const handler of handlers) {
      const result = handler(lines, cursor) as
        | { block: MarkdownBlock; nextIndex: number }
        | null;
      if (result) {
        blocks.push(result.block);
        cursor = result.nextIndex;
        consumed = true;
        break;
      }
    }

    if (!consumed) {
      cursor += 1;
    }
  }

  return blocks;
}
