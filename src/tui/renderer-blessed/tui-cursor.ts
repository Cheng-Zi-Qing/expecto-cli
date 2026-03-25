import blessed from "neo-blessed";

import type { TuiFocus } from "../tui-types.ts";

type BlessedUnicodeApi = {
  unicode: {
    strWidth(text: string): number;
  };
};

export type ComposerCursorPlacement = {
  visible: boolean;
  x?: number;
  y?: number;
};

type ComposerBoxPosition = {
  xi: number;
  yi: number;
};

type GetComposerCursorPlacementInput = {
  focus: TuiFocus;
  inputLocked: boolean;
  draft: string;
  composerBox?: ComposerBoxPosition;
  paddingLeft: number;
  paddingTop: number;
  maxVisibleLines?: number;
};

function displayWidth(text: string): number {
  return (blessed as typeof blessed & BlessedUnicodeApi).unicode.strWidth(text);
}

export function getComposerCursorPlacement(
  input: GetComposerCursorPlacementInput,
): ComposerCursorPlacement {
  if (input.focus !== "composer" || input.inputLocked || input.composerBox === undefined) {
    return {
      visible: false,
    };
  }

  const contentStartX = input.composerBox.xi + 1 + input.paddingLeft;
  const contentStartY = input.composerBox.yi + 1 + input.paddingTop;
  const lines = input.draft.length > 0 ? input.draft.split("\n") : [""];
  const visibleLines = lines.slice(-(input.maxVisibleLines ?? 4));
  const lastLine = visibleLines.at(-1) ?? "";

  return {
    visible: true,
    x: contentStartX + displayWidth(lastLine),
    y: contentStartY + visibleLines.length - 1,
  };
}
