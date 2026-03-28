function normalizeWidth(width: number): number {
  return Number.isFinite(width) && width > 0 ? Math.floor(width) : 1;
}

function isWhitespace(char: string): boolean {
  return char === " " || char === "\t";
}

function isCombiningMark(char: string): boolean {
  return /\p{Mark}/u.test(char);
}

function isWideCharacter(char: string): boolean {
  return /[\u1100-\u115F\u231A-\u231B\u2329-\u232A\u23E9-\u23EC\u23F0\u23F3\u25FD-\u25FE\u2614-\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA-\u26AB\u26BD-\u26BE\u26C4-\u26C5\u26CE\u26D4\u26EA\u26F2-\u26F3\u26F5\u26FA\u26FD\u2705\u270A-\u270B\u2728\u274C\u274E\u2753-\u2755\u2757\u2795-\u2797\u27B0\u27BF\u2B1B-\u2B1C\u2B50\u2B55\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF01-\uFF60\uFFE0-\uFFE6]|\p{Extended_Pictographic}/u
    .test(char);
}

export function charDisplayWidth(char: string): number {
  if (char.length === 0) {
    return 0;
  }

  if (isCombiningMark(char)) {
    return 0;
  }

  return isWideCharacter(char) ? 2 : 1;
}

export function textDisplayWidth(value: string): number {
  return Array.from(value).reduce((width, char) => width + charDisplayWidth(char), 0);
}

function wrapSingleLine(line: string, width: number): string[] {
  const characters = Array.from(line);

  if (characters.length === 0) {
    return [""];
  }

  const wrapped: string[] = [];
  let start = 0;

  while (start < characters.length) {
    let hardEnd = start;
    let consumedWidth = 0;

    while (hardEnd < characters.length) {
      const nextWidth = charDisplayWidth(characters[hardEnd] ?? "");

      if (hardEnd > start && consumedWidth + nextWidth > width) {
        break;
      }

      consumedWidth += nextWidth;
      hardEnd += 1;

      if (consumedWidth >= width) {
        break;
      }
    }

    if (hardEnd === characters.length) {
      wrapped.push(characters.slice(start).join(""));
      break;
    }

    let splitAt = -1;
    for (let index = hardEnd - 1; index > start; index -= 1) {
      if (isWhitespace(characters[index] ?? "")) {
        splitAt = index;
        break;
      }
    }

    if (splitAt !== -1) {
      wrapped.push(characters.slice(start, splitAt).join(""));
      start = splitAt;
      continue;
    }

    wrapped.push(characters.slice(start, hardEnd).join(""));
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

  const characters = Array.from(value);
  let currentWidth = 0;
  let end = 0;

  while (end < characters.length) {
    const nextWidth = charDisplayWidth(characters[end] ?? "");

    if (end > 0 && currentWidth + nextWidth > normalizedWidth) {
      break;
    }

    currentWidth += nextWidth;
    end += 1;

    if (currentWidth >= normalizedWidth) {
      break;
    }
  }

  const visible = characters.slice(0, end).join("");

  if (currentWidth >= normalizedWidth) {
    return visible;
  }

  return visible + " ".repeat(normalizedWidth - currentWidth);
}
