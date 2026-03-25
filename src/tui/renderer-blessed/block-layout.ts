import blessed from "neo-blessed";

type BlessedUnicodeApi = {
  unicode: {
    strWidth(text: string): number;
  };
};

export type RenderedTimelineLayout = {
  content: string;
  selectedLine: number;
  itemStartLines: number[];
};

function countWrappedLines(line: string, wrapWidth: number): number {
  if (!Number.isFinite(wrapWidth) || wrapWidth <= 0) {
    return 1;
  }

  const visibleText = blessed.stripTags(line);
  const width = (blessed as typeof blessed & BlessedUnicodeApi).unicode.strWidth(
    visibleText,
  );

  return Math.max(1, Math.ceil(width / wrapWidth));
}

export function countRenderedLines(text: string, wrapWidth?: number): number {
  const lines = text.length === 0 ? [""] : text.split("\n");

  if (wrapWidth === undefined) {
    return lines.length;
  }

  return lines.reduce((count, line) => count + countWrappedLines(line, wrapWidth), 0);
}

export function layoutRenderedCards(
  items: string[],
  selectedIndex: number,
  options?: {
    wrapWidth?: number;
  },
): RenderedTimelineLayout {
  const chunks: string[] = [];
  const itemStartLines: number[] = [];
  let selectedLine = 0;
  let currentLine = 0;
  const wrapWidth = options?.wrapWidth;

  items.forEach((item, index) => {
    itemStartLines.push(currentLine);

    if (index === selectedIndex) {
      selectedLine = currentLine;
    }

    chunks.push(item);
    currentLine += countRenderedLines(item, wrapWidth);

    if (index < items.length - 1) {
      chunks.push("");
      currentLine += 1;
    }
  });

  return {
    content: chunks.join("\n"),
    selectedLine,
    itemStartLines,
  };
}
