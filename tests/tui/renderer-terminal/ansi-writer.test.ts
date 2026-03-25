import assert from "node:assert/strict";
import test from "node:test";

import { createAnsiWriter } from "../../../src/tui/renderer-terminal/ansi-writer.ts";

test("createAnsiWriter emits clear and cursor movement sequences in order", () => {
  const writes: string[] = [];
  const writer = createAnsiWriter((chunk) => writes.push(chunk));

  writer.hideCursor();
  writer.moveCursor(10, 4);
  writer.clearLine();
  writer.showCursor();

  assert.deepEqual(writes, ["\u001b[?25l", "\u001b[4;10H", "\u001b[2K", "\u001b[?25h"]);
});

test("createAnsiWriter emits alternate-screen enter and exit sequences", () => {
  const writes: string[] = [];
  const writer = createAnsiWriter((chunk) => writes.push(chunk));

  writer.enterAlternateScreen();
  writer.exitAlternateScreen();

  assert.deepEqual(writes, ["\u001b[?1049h", "\u001b[?1049l"]);
});
