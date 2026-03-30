import type { CommandMenuState, TuiFocus } from "../tui-types.ts";

export type BlessedKey = {
  name?: string;
  full?: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  sequence?: string;
};

export type KeypressSnapshot = {
  focus: TuiFocus;
  inputLocked: boolean;
  draft: string;
  themePickerActive?: boolean;
};

export type KeypressAction =
  | "exit"
  | "interrupt"
  | "toggle_inspector"
  | "toggle_timeline_mode"
  | "focus_timeline"
  | "focus_composer"
  | "move_selection_left"
  | "move_selection_right"
  | "move_selection_up"
  | "move_selection_down"
  | "move_selection_page_up"
  | "move_selection_page_down"
  | "toggle_selected_item";

export type KeypressResult = {
  actions: KeypressAction[];
  nextDraft?: string;
  submitPrompt?: string;
};

export type CommandMenuLayout = {
  visible: boolean;
  height: number;
};

function isPrintableKey(character: string | undefined, key: BlessedKey): boolean {
  return (
    !!character &&
    !key.ctrl &&
    !key.meta &&
    key.name !== "enter" &&
    key.name !== "return" &&
    key.name !== "tab" &&
    key.name !== "escape" &&
    key.name !== "backspace"
  );
}

function deleteLastCharacter(text: string): string {
  return Array.from(text).slice(0, -1).join("");
}

function isAltEnter(key: BlessedKey): boolean {
  return key.meta === true && key.name === "enter";
}

export function resolveBlessedTerminal(term: string | undefined): string | undefined {
  if (term === "xterm-256color") {
    return "screen-256color";
  }

  return term;
}

export function getCommandMenuLayout(commandMenu: CommandMenuState): CommandMenuLayout {
  if (!commandMenu.visible) {
    return {
      visible: false,
      height: 0,
    };
  }

  return {
    visible: true,
    height: Math.max(3, commandMenu.items.length + 2),
  };
}

export function interpretKeypress(
  snapshot: KeypressSnapshot,
  character: string | undefined,
  key: BlessedKey,
): KeypressResult {
  if (key.ctrl && key.name === "d") {
    return {
      actions: ["exit"],
    };
  }

  if (key.name === "f2") {
    return {
      actions: ["toggle_timeline_mode"],
    };
  }

  if (snapshot.inputLocked && key.ctrl && key.name === "c") {
    return {
      actions: ["interrupt"],
    };
  }

  if (snapshot.themePickerActive) {
    if (key.name === "left") {
      return {
        actions: ["move_selection_left"],
      };
    }

    if (key.name === "right") {
      return {
        actions: ["move_selection_right"],
      };
    }

    if (key.name === "up") {
      return {
        actions: ["move_selection_up"],
      };
    }

    if (key.name === "down") {
      return {
        actions: ["move_selection_down"],
      };
    }

    if (key.name === "enter") {
      return {
        actions: ["toggle_selected_item"],
      };
    }
  }

  if (key.name === "pageup") {
    return {
      actions: ["move_selection_page_up"],
    };
  }

  if (key.name === "pagedown") {
    return {
      actions: ["move_selection_page_down"],
    };
  }

  if (key.name === "tab") {
    return {
      actions: [snapshot.focus === "timeline" ? "focus_composer" : "focus_timeline"],
    };
  }

  if (key.name === "escape") {
    return {
      actions: ["focus_timeline"],
    };
  }

  if (snapshot.focus === "timeline") {
    if (key.name === "i") {
      return {
        actions: ["focus_composer"],
      };
    }

    if (key.name === "o") {
      return {
        actions: ["toggle_inspector"],
      };
    }

    if (key.name === "up") {
      return {
        actions: ["move_selection_up"],
      };
    }

    if (key.name === "down") {
      return {
        actions: ["move_selection_down"],
      };
    }

    if (key.name === "enter") {
      return {
        actions: ["toggle_selected_item"],
      };
    }

    if (!snapshot.inputLocked && isPrintableKey(character, key)) {
      return {
        actions: ["focus_composer"],
        nextDraft: snapshot.draft + character,
      };
    }

    return {
      actions: [],
    };
  }

  if (snapshot.inputLocked) {
    return {
      actions: [],
    };
  }

  if (key.name === "backspace") {
    return {
      actions: [],
      nextDraft: deleteLastCharacter(snapshot.draft),
    };
  }

  if ((key.ctrl && key.name === "j") || isAltEnter(key)) {
    return {
      actions: [],
      nextDraft: `${snapshot.draft}\n`,
    };
  }

  if (key.name === "enter") {
    if (snapshot.draft.trim().length === 0) {
      return {
        actions: [],
      };
    }

    return {
      actions: [],
      nextDraft: "",
      submitPrompt: snapshot.draft,
    };
  }

  if (isPrintableKey(character, key)) {
    return {
      actions: [],
      nextDraft: snapshot.draft + character,
    };
  }

  return {
    actions: [],
  };
}
