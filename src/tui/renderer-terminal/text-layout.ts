function normalizeWidth(width: number): number {
  return Number.isFinite(width) && width > 0 ? Math.floor(width) : 1;
}

function wrapSingleLine(line: string, width: number): string[] {
  if (line.length === 0) {
    return [""];
  }

  const words = line.trim().split(/\s+/);
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    if (word.length > width) {
      if (current.length > 0) {
        wrapped.push(current);
        current = "";
      }
      for (let index = 0; index < word.length; index += width) {
        wrapped.push(word.slice(index, index + width));
      }
      continue;
    }

    if (current.length === 0) {
      current = word;
      continue;
    }

    const next = `${current} ${word}`;
    if (next.length <= width) {
      current = next;
    } else {
      wrapped.push(current);
      current = word;
    }
  }

  if (current.length > 0) {
    wrapped.push(current);
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
