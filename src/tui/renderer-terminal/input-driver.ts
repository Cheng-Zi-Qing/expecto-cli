import type { InteractiveTuiHandlers, TerminalTuiInputChunk } from "../tui-app.ts";
import {
  deleteLastDraftUnit,
  shouldConvertToAttachment,
} from "../draft-attachment.ts";
import type { DraftAttachment } from "../tui-types.ts";

type TerminalInputHandlers = Pick<
  InteractiveTuiHandlers,
  | "onDraftChange"
  | "onSubmit"
  | "onInterrupt"
  | "onExit"
  | "onMoveSelectionUp"
  | "onMoveSelectionDown"
  | "onMoveSelectionLeft"
  | "onMoveSelectionRight"
  | "onToggleSelectedItem"
  | "onAddAttachment"
>;

function normalizeChunk(chunk: TerminalTuiInputChunk): string {
  if (typeof chunk === "string") {
    return chunk;
  }

  return Buffer.from(chunk).toString("utf8");
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

export type PasteState = {
  inPaste: boolean;
  pasteBuffer: string;
  pasteStartDraft: string;
};

export function createPasteState(): PasteState {
  return { inPaste: false, pasteBuffer: "", pasteStartDraft: "" };
}

export function handleTerminalInputChunk(
  chunk: TerminalTuiInputChunk,
  state: { draft: string; inputLocked: boolean; themePickerActive?: boolean; draftAttachments?: DraftAttachment[]; pasteState?: PasteState },
  handlers: TerminalInputHandlers,
): void {
  const characters = Array.from(normalizeChunk(chunk));
  let nextDraft = state.draft;
  let draftChanged = false;
  const ps = state.pasteState ?? { inPaste: false, pasteBuffer: "", pasteStartDraft: "" };
  // local aliases for readability
  let inPaste = ps.inPaste;
  let pasteBuffer = ps.pasteBuffer;
  let pasteStartDraft = ps.pasteStartDraft;
  let lastWasPasteCR = false;

  for (let index = 0; index < characters.length; index += 1) {
    const escapeSequence = readEscapeSequence(characters, index);

    if (escapeSequence !== null) {
      lastWasPasteCR = false;
      index += escapeSequence.length - 1;

      if (escapeSequence.sequence === "\u001b[200~") {
        inPaste = true;
        pasteBuffer = "";
        pasteStartDraft = nextDraft;
        continue;
      }

      if (escapeSequence.sequence === "\u001b[201~") {
        inPaste = false;
        if (shouldConvertToAttachment(pasteBuffer) && handlers.onAddAttachment) {
          // Revert draft to pre-paste state, then add attachment
          nextDraft = pasteStartDraft;
          if (draftChanged) {
            handlers.onDraftChange(nextDraft);
            draftChanged = false;
          }
          handlers.onAddAttachment(pasteBuffer);
          pasteBuffer = "";
          continue;
        }
        pasteBuffer = "";
        continue;
      }

      if (state.themePickerActive) {
        if (escapeSequence.sequence === "\u001b[A") {
          handlers.onMoveSelectionUp();
        } else if (escapeSequence.sequence === "\u001b[B") {
          handlers.onMoveSelectionDown();
        } else if (escapeSequence.sequence === "\u001b[D") {
          handlers.onMoveSelectionLeft?.();
        } else if (escapeSequence.sequence === "\u001b[C") {
          handlers.onMoveSelectionRight?.();
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
      nextDraft = deleteLastDraftUnit(nextDraft, state.draftAttachments ?? []);
      draftChanged = true;
      continue;
    }

    if (character === "\n") {
      if (inPaste && lastWasPasteCR) {
        // normalize \r\n → \n (already added \n for the \r)
        lastWasPasteCR = false;
        continue;
      }
      lastWasPasteCR = false;
      if (inPaste) {
        pasteBuffer += "\n";
      }
      nextDraft = `${nextDraft}\n`;
      draftChanged = true;
      continue;
    }

    if (character === "\r") {
      if (inPaste) {
        lastWasPasteCR = true;
        pasteBuffer += "\n";
        nextDraft = `${nextDraft}\n`;
        draftChanged = true;
        continue;
      }

      lastWasPasteCR = false;

      if (draftChanged) {
        handlers.onDraftChange(nextDraft);
        draftChanged = false;
      }
      handlers.onSubmit(nextDraft);
      nextDraft = "";
      continue;
    }

    if (isPrintableCharacter(character)) {
      lastWasPasteCR = false;
      if (inPaste) {
        pasteBuffer += character;
      }
      nextDraft = `${nextDraft}${character}`;
      draftChanged = true;
    }
  }

  if (draftChanged) {
    handlers.onDraftChange(nextDraft);
  }

  // Write back paste state so callers with persistent pasteState get updates
  ps.inPaste = inPaste;
  ps.pasteBuffer = pasteBuffer;
  ps.pasteStartDraft = pasteStartDraft;
}
