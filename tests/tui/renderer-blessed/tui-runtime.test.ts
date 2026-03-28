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

test("interpretKeypress uses Tab for focus traversal instead of inspector toggling", () => {
  const composerTab = interpretKeypress(
    {
      focus: "composer",
      inputLocked: false,
      draft: "draft",
    },
    undefined,
    {
      name: "tab",
    },
  );
  const timelineTab = interpretKeypress(
    {
      focus: "timeline",
      inputLocked: false,
      draft: "draft",
    },
    undefined,
    {
      name: "tab",
    },
  );

  assert.deepEqual(composerTab.actions, ["focus_timeline"]);
  assert.deepEqual(timelineTab.actions, ["focus_composer"]);
});

test("interpretKeypress reserves o for inspector toggling only in timeline focus", () => {
  const timelineToggle = interpretKeypress(
    {
      focus: "timeline",
      inputLocked: false,
      draft: "draft",
    },
    "o",
    {
      name: "o",
    },
  );
  const composerText = interpretKeypress(
    {
      focus: "composer",
      inputLocked: false,
      draft: "draft",
    },
    "o",
    {
      name: "o",
    },
  );

  assert.deepEqual(timelineToggle.actions, ["toggle_inspector"]);
  assert.equal(timelineToggle.nextDraft, undefined);
  assert.deepEqual(composerText.actions, []);
  assert.equal(composerText.nextDraft, "drafto");
});

test("interpretKeypress toggles timeline scroll and select modes with F2", () => {
  const result = interpretKeypress(
    {
      focus: "timeline",
      inputLocked: false,
      draft: "",
    },
    undefined,
    {
      name: "f2",
    },
  );

  assert.deepEqual(result.actions, ["toggle_timeline_mode"]);
});

test("interpretKeypress maps page navigation keys to timeline paging actions globally", () => {
  const pageUp = interpretKeypress(
    {
      focus: "composer",
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
      focus: "composer",
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
        id: "session.status",
        name: "/status",
        aliases: [],
        description: "Show the current session status.",
      },
      {
        id: "project.branch",
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

test("interpretKeypress routes up/down/enter to the theme picker before normal composer behavior", () => {
  const moveUp = interpretKeypress(
    {
      focus: "composer",
      inputLocked: false,
      draft: "draft",
      themePickerActive: true,
    },
    undefined,
    {
      name: "up",
    },
  );
  const moveDown = interpretKeypress(
    {
      focus: "composer",
      inputLocked: false,
      draft: "draft",
      themePickerActive: true,
    },
    undefined,
    {
      name: "down",
    },
  );
  const apply = interpretKeypress(
    {
      focus: "composer",
      inputLocked: false,
      draft: "draft",
      themePickerActive: true,
    },
    undefined,
    {
      name: "enter",
    },
  );

  assert.deepEqual(moveUp.actions, ["move_selection_up"]);
  assert.equal(moveUp.nextDraft, undefined);
  assert.deepEqual(moveDown.actions, ["move_selection_down"]);
  assert.deepEqual(apply.actions, ["toggle_selected_item"]);
  assert.equal(apply.submitPrompt, undefined);
});
