function normalizeWidth(width: number): number {
  return Number.isFinite(width) && width > 0 ? Math.floor(width) : 1;
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t";
}

function wrapSingleLine(line: string, width: number): string[] {
  if (line.length === 0) {
    return [""];
  }

  const wrapped: string[] = [];
  let start = 0;

  while (start < line.length) {
    const hardEnd = Math.min(start + width, line.length);
    if (hardEnd === line.length) {
      wrapped.push(line.slice(start));
      break;
    }

    let splitAt = -1;
    for (let index = hardEnd - 1; index > start; index -= 1) {
      if (isWhitespace(line[index] ?? "")) {
        splitAt = index;
        break;
      }
    }

    if (splitAt !== -1) {
      wrapped.push(line.slice(start, splitAt));
      start = splitAt;
      continue;
    }

    wrapped.push(line.slice(start, hardEnd));
    start = hardEnd;
  }

  return wrapped;
}

export function wrapPlainText(value: string, width: number): string[] {
  const normalizedWidth = normalizeWidth(width);
  const normalized = value.replaceAll("\r\n", "\n");
  const sourceLines = normalized.split("\n");

  return sourceLines.flatMap((line) => wrapSingleLine(line, normalizedWidth));
}

export function padOrTrimToWidth(value: string, width: number): string {
  const normalizedWidth = Number.isFinite(width) && width > 0 ? Math.floor(width) : 0;

  if (normalizedWidth === 0) {
    return "";
  }

  if (value.length >= normalizedWidth) {
    return value.slice(0, normalizedWidth);
  }

  return value.padEnd(normalizedWidth, " ");
}
