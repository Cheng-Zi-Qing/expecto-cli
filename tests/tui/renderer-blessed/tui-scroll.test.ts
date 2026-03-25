import test from "node:test";
import assert from "node:assert/strict";

import {
  findPageSelectionIndex,
  getTimelineViewportLineCount,
} from "../../../src/tui/renderer-blessed/tui-scroll.ts";

test("findPageSelectionIndex pages downward to the next item outside the current viewport", () => {
  const index = findPageSelectionIndex({
    itemStartLines: [0, 2, 5, 11, 14],
    selectedIndex: 0,
    viewportLines: 6,
    direction: "down",
  });

  assert.equal(index, 2);
});

test("findPageSelectionIndex pages upward to the nearest prior item outside the viewport", () => {
  const index = findPageSelectionIndex({
    itemStartLines: [0, 2, 5, 11, 14],
    selectedIndex: 4,
    viewportLines: 6,
    direction: "up",
  });

  assert.equal(index, 2);
});

test("findPageSelectionIndex clamps at the timeline boundaries", () => {
  assert.equal(
    findPageSelectionIndex({
      itemStartLines: [0, 2, 5],
      selectedIndex: 2,
      viewportLines: 20,
      direction: "down",
    }),
    2,
  );
  assert.equal(
    findPageSelectionIndex({
      itemStartLines: [0, 2, 5],
      selectedIndex: 0,
      viewportLines: 20,
      direction: "up",
    }),
    0,
  );
});

test("getTimelineViewportLineCount uses rendered box size minus borders", () => {
  assert.equal(
    getTimelineViewportLineCount({
      boxPosition: {
        yi: 0,
        yl: 11,
      },
    }),
    10,
  );
  assert.equal(
    getTimelineViewportLineCount({
      height: 7,
    }),
    5,
  );
});
