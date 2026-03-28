import test from "node:test";
import assert from "node:assert/strict";

import { getComposerCursorPlacement } from "../../../src/tui/renderer-blessed/tui-cursor.ts";

test("getComposerCursorPlacement anchors an empty composer at the content start", () => {
  const placement = getComposerCursorPlacement({
    focus: "composer",
    inputLocked: false,
    draft: "",
    composerBox: {
      xi: 0,
      yi: 16,
    },
    paddingLeft: 1,
    paddingTop: 0,
  });

  assert.deepEqual(placement, {
    visible: true,
    x: 2,
    y: 17,
  });
});

test("getComposerCursorPlacement follows the last visible draft line", () => {
  const placement = getComposerCursorPlacement({
    focus: "composer",
    inputLocked: false,
    draft: "alpha\nbeta\ncharlie",
    composerBox: {
      xi: 0,
      yi: 16,
    },
    paddingLeft: 1,
    paddingTop: 0,
  });

  assert.deepEqual(placement, {
    visible: true,
    x: 9,
    y: 19,
  });
});

test("getComposerCursorPlacement uses display width for wide characters", () => {
  const placement = getComposerCursorPlacement({
    focus: "composer",
    inputLocked: false,
    draft: "alpha\n中文",
    composerBox: {
      xi: 0,
      yi: 16,
    },
    paddingLeft: 1,
    paddingTop: 0,
  });

  assert.deepEqual(placement, {
    visible: true,
    x: 6,
    y: 18,
  });
});

test("getComposerCursorPlacement follows soft-wrapped composer lines within the visible width", () => {
  const placement = getComposerCursorPlacement({
    focus: "composer",
    inputLocked: false,
    draft: "abcdefghij",
    composerBox: {
      xi: 0,
      yi: 16,
    },
    paddingLeft: 1,
    paddingTop: 0,
    maxLineWidth: 4,
  });

  assert.deepEqual(placement, {
    visible: true,
    x: 4,
    y: 19,
  });
});

test("getComposerCursorPlacement hides the real cursor outside active composer editing", () => {
  assert.deepEqual(
    getComposerCursorPlacement({
      focus: "timeline",
      inputLocked: false,
      draft: "alpha",
      composerBox: {
        xi: 0,
        yi: 16,
      },
      paddingLeft: 1,
      paddingTop: 0,
    }),
    {
      visible: false,
    },
  );
  assert.deepEqual(
    getComposerCursorPlacement({
      focus: "composer",
      inputLocked: true,
      draft: "alpha",
      composerBox: {
        xi: 0,
        yi: 16,
      },
      paddingLeft: 1,
      paddingTop: 0,
    }),
    {
      visible: false,
    },
  );
});
