import { wrapPlainText } from "../renderer-terminal/text-layout.ts";

export function getVisibleComposerLines(
  draft: string,
  options: {
    maxVisibleLines: number | undefined;
    maxLineWidth: number | undefined;
  } = {
    maxVisibleLines: undefined,
    maxLineWidth: undefined,
  },
): string[] {
  const maxVisibleLines = options.maxVisibleLines ?? 4;
  const maxLineWidth = options.maxLineWidth;
  const lines =
    draft.length === 0
      ? [""]
      : maxLineWidth !== undefined
        ? wrapPlainText(draft, maxLineWidth)
        : draft.split("\n");

  const visibleLines = lines.slice(-maxVisibleLines);
  return visibleLines.length > 0 ? visibleLines : [""];
}
