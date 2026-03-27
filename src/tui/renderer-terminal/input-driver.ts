import type { InteractiveTuiHandlers, TerminalTuiInputChunk } from "../tui-app.ts";
import type { TuiState } from "../tui-types.ts";

type TerminalInputHandlers = Pick<
  InteractiveTuiHandlers,
  | "onDraftChange"
  | "onSubmit"
  | "onInterrupt"
  | "onToggleInspector"
  | "onFocusTimeline"
  | "onFocusComposer"
  | "onMoveSelectionUp"
  | "onMoveSelectionDown"
  | "onToggleSelectedItem"
  | "onExit"
> & {
  onMoveSelectionPageUp?: () => void;
  onMoveSelectionPageDown?: () => void;
};

function normalizeChunk(chunk: TerminalTuiInputChunk): string {
  if (typeof chunk === "string") {
    return chunk;
  }

  return Buffer.from(chunk).toString("utf8");
}

function removeLastCharacter(value: string): string {
  const characters = Array.from(value);
  characters.pop();
  return characters.join("");
}

function isPrintableCharacter(character: string): boolean {
  return character >= " " && character !== "\u007f";
}

function readEscapeSequence(
  characters: string[],
  index: number,
): { sequence: string; length: number } | null {
  if (characters[index] !== "\u001b") {
    return null;
  }

  if (characters[index + 1] !== "[") {
    return {
      sequence: "\u001b",
      length: 1,
    };
  }

  let length = 2;

  while (index + length < characters.length) {
    const character = characters[index + length] ?? "";
    length += 1;

    if ((character >= "A" && character <= "Z") || (character >= "a" && character <= "z") || character === "~") {
      break;
    }
  }

  return {
    sequence: characters.slice(index, index + length).join(""),
    length,
  };
}

export function handleTerminalInputChunk(
  chunk: TerminalTuiInputChunk,
  state: TuiState,
  handlers: TerminalInputHandlers,
): void {
  const characters = Array.from(normalizeChunk(chunk));
  let nextDraft = state.draft;
  let draftChanged = false;
  let focus = state.focus;

  for (let index = 0; index < characters.length; index += 1) {
    const escapeSequence = readEscapeSequence(characters, index);

    if (escapeSequence !== null) {
      index += escapeSequence.length - 1;

      switch (escapeSequence.sequence) {
        case "\u001b":
          handlers.onFocusTimeline();
          focus = "timeline";
          break;
        case "\u001b[A":
          if (focus === "timeline") {
            handlers.onMoveSelectionUp();
          }
          break;
        case "\u001b[B":
          if (focus === "timeline") {
            handlers.onMoveSelectionDown();
          }
          break;
        case "\u001b[5~":
          if (focus === "timeline") {
            handlers.onMoveSelectionPageUp?.();
          }
          break;
        case "\u001b[6~":
          if (focus === "timeline") {
            handlers.onMoveSelectionPageDown?.();
          }
          break;
      }
      continue;
    }

    const character = characters[index] ?? "";

    if (character === "\u0003") {
      if (state.inputLocked) {
        handlers.onInterrupt();
      }
      continue;
    }

    if (character === "\u0004") {
      handlers.onExit();
      continue;
    }

    if (state.inputLocked) {
      continue;
    }

    if (focus === "timeline") {
      if (character === "\t") {
        handlers.onToggleInspector();
        continue;
      }

      if (character === "i") {
        handlers.onFocusComposer();
        focus = "composer";
        continue;
      }

      if (character === "\r") {
        handlers.onToggleSelectedItem();
        continue;
      }

      if (isPrintableCharacter(character)) {
        handlers.onFocusComposer();
        focus = "composer";
        nextDraft = `${nextDraft}${character}`;
        draftChanged = true;
      }
      continue;
    }

    if (character === "\t") {
      handlers.onToggleInspector();
      continue;
    }

    if (character === "\u007f" || character === "\b") {
      nextDraft = removeLastCharacter(nextDraft);
      draftChanged = true;
      continue;
    }

    if (character === "\n") {
      nextDraft = `${nextDraft}\n`;
      draftChanged = true;
      continue;
    }

    if (character === "\r") {
      if (draftChanged) {
        handlers.onDraftChange(nextDraft);
        draftChanged = false;
      }
      handlers.onSubmit(nextDraft);
      nextDraft = "";
      continue;
    }

    if (isPrintableCharacter(character)) {
      nextDraft = `${nextDraft}${character}`;
      draftChanged = true;
    }
  }

  if (draftChanged) {
    handlers.onDraftChange(nextDraft);
  }
}
