import assert from "node:assert/strict";
import test from "node:test";

import { handleTerminalInputChunk } from "../../../src/tui/renderer-terminal/input-driver.ts";

test("handleTerminalInputChunk routes left and right arrows to theme picker navigation", () => {
  let moveLeftCalls = 0;
  let moveRightCalls = 0;

  handleTerminalInputChunk(
    "\u001b[D\u001b[C",
    {
      draft: "",
      inputLocked: false,
      themePickerActive: true,
    },
    {
      onDraftChange() {},
      onSubmit() {},
      onInterrupt() {},
      onExit() {},
      onMoveSelectionUp() {},
      onMoveSelectionDown() {},
      onMoveSelectionLeft: () => {
        moveLeftCalls += 1;
      },
      onMoveSelectionRight: () => {
        moveRightCalls += 1;
      },
      onToggleSelectedItem() {},
    },
  );

  assert.equal(moveLeftCalls, 1);
  assert.equal(moveRightCalls, 1);
});
