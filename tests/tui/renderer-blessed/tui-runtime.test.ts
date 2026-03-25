import test from "node:test";
import assert from "node:assert/strict";

import {
  getCommandMenuLayout,
  interpretKeypress,
  resolveBlessedTerminal,
} from "../../../src/tui/renderer-blessed/tui-runtime.ts";

test("resolveBlessedTerminal falls back from xterm-256color to a 256-color safe profile", () => {
  assert.equal(resolveBlessedTerminal("xterm-256color"), "screen-256color");
  assert.equal(resolveBlessedTerminal("tmux-256color"), "tmux-256color");
  assert.equal(resolveBlessedTerminal(undefined), undefined);
});

test("interpretKeypress treats i as text in composer focus", () => {
  const result = interpretKeypress(
    {
      focus: "composer",
      inputLocked: false,
      draft: "cla",
    },
    "i",
    {
      name: "i",
    },
  );

  assert.deepEqual(result.actions, []);
  assert.equal(result.nextDraft, "clai");
});

test("interpretKeypress treats i as a focus shortcut only in timeline focus", () => {
  const result = interpretKeypress(
    {
      focus: "timeline",
      inputLocked: false,
      draft: "cla",
    },
    "i",
    {
      name: "i",
    },
  );

  assert.deepEqual(result.actions, ["focus_composer"]);
  assert.equal(result.nextDraft, undefined);
});

test("interpretKeypress maps page navigation keys to timeline paging actions", () => {
  const pageUp = interpretKeypress(
    {
      focus: "timeline",
      inputLocked: false,
      draft: "",
    },
    undefined,
    {
      name: "pageup",
    },
  );
  const pageDown = interpretKeypress(
    {
      focus: "timeline",
      inputLocked: false,
      draft: "",
    },
    undefined,
    {
      name: "pagedown",
    },
  );

  assert.deepEqual(pageUp.actions, ["move_selection_page_up"]);
  assert.deepEqual(pageDown.actions, ["move_selection_page_down"]);
});

test("getCommandMenuLayout only reserves space when the slash palette is visible", () => {
  const hidden = getCommandMenuLayout({
    visible: false,
    query: "",
    items: [],
    selectedIndex: 0,
  });
  const visible = getCommandMenuLayout({
    visible: true,
    query: "st",
    items: [
      {
        id: "status",
        name: "/status",
        aliases: [],
        description: "Show the current session status.",
      },
      {
        id: "branch",
        name: "/branch",
        aliases: [],
        description: "Show the current git branch for the project root.",
      },
    ],
    selectedIndex: 0,
  });
  const empty = getCommandMenuLayout({
    visible: true,
    query: "zzz",
    items: [],
    selectedIndex: 0,
  });

  assert.deepEqual(hidden, {
    visible: false,
    height: 0,
  });
  assert.deepEqual(visible, {
    visible: true,
    height: 4,
  });
  assert.deepEqual(empty, {
    visible: true,
    height: 3,
  });
});
