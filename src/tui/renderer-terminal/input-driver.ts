import type { InteractiveTuiHandlers, TerminalTuiInputChunk } from "../tui-app.ts";

type TerminalInputHandlers = Pick<
  InteractiveTuiHandlers,
  | "onDraftChange"
  | "onSubmit"
  | "onInterrupt"
  | "onExit"
  | "onMoveSelectionUp"
  | "onMoveSelectionDown"
  | "onToggleSelectedItem"
>;

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

  const nextCharacter = characters[index + 1] ?? "";

  if (nextCharacter === "\r" || nextCharacter === "\n") {
    return {
      sequence: `\u001b${nextCharacter}`,
      length: 2,
    };
  }

  if (nextCharacter !== "[") {
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
  state: { draft: string; inputLocked: boolean; themePickerActive?: boolean },
  handlers: TerminalInputHandlers,
): void {
  const characters = Array.from(normalizeChunk(chunk));
  let nextDraft = state.draft;
  let draftChanged = false;

  for (let index = 0; index < characters.length; index += 1) {
    const escapeSequence = readEscapeSequence(characters, index);

    if (escapeSequence !== null) {
      index += escapeSequence.length - 1;

      if (state.themePickerActive) {
        if (escapeSequence.sequence === "\u001b[A") {
          handlers.onMoveSelectionUp();
        } else if (escapeSequence.sequence === "\u001b[B") {
          handlers.onMoveSelectionDown();
        }
        continue;
      }

      switch (escapeSequence.sequence) {
        case "\u001b\r":
        case "\u001b\n":
          if (!state.inputLocked) {
            nextDraft = `${nextDraft}\n`;
            draftChanged = true;
          }
          break;
        default:
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

    if (state.themePickerActive) {
      if (character === "\r" || character === "\n") {
        handlers.onToggleSelectedItem();
      }
      continue;
    }

    if (character === "\t") {
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
