export function findPageSelectionIndex(input: {
  itemStartLines: number[];
  selectedIndex: number;
  viewportLines: number;
  direction: "up" | "down";
}): number {
  if (input.itemStartLines.length === 0) {
    return 0;
  }

  const selectedIndex = Math.max(
    0,
    Math.min(input.selectedIndex, input.itemStartLines.length - 1),
  );
  const currentLine = input.itemStartLines[selectedIndex] ?? 0;
  const pageSpan = Math.max(1, input.viewportLines - 1);

  if (input.direction === "down") {
    const targetLine = currentLine + pageSpan;

    for (let index = selectedIndex + 1; index < input.itemStartLines.length; index += 1) {
      if ((input.itemStartLines[index] ?? 0) >= targetLine) {
        return index;
      }
    }

    return input.itemStartLines.length - 1;
  }

  const targetLine = currentLine - pageSpan;

  for (let index = selectedIndex - 1; index >= 0; index -= 1) {
    if ((input.itemStartLines[index] ?? 0) <= targetLine) {
      return index;
    }
  }

  return 0;
}

export function getTimelineViewportLineCount(input: {
  height?: number;
  boxPosition?: {
    yi: number;
    yl: number;
  };
}): number {
  const renderedHeight =
    input.boxPosition !== undefined
      ? input.boxPosition.yl - input.boxPosition.yi + 1
      : input.height;

  if (renderedHeight === undefined || renderedHeight <= 2) {
    return 1;
  }

  return Math.max(1, renderedHeight - 2);
}
