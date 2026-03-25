import type { InteractiveTuiHandlers, TerminalTuiInputChunk } from "../tui-app.ts";
import type { TuiState } from "../tui-types.ts";

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

export function handleTerminalInputChunk(
  chunk: TerminalTuiInputChunk,
  state: TuiState,
  handlers: Pick<
    InteractiveTuiHandlers,
    "onDraftChange" | "onSubmit" | "onInterrupt" | "onToggleInspector" | "onExit"
  >,
): void {
  const text = normalizeChunk(chunk);
  let nextDraft = state.draft;
  let draftChanged = false;

  for (const character of Array.from(text)) {
    if (character === "\u0003") {
      handlers.onInterrupt();
      continue;
    }

    if (character === "\u0004") {
      handlers.onExit();
      continue;
    }

    if (state.inputLocked) {
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

    if (character === "\u001b") {
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
