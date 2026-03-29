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

test("createAnsiWriter emits clear-screen and scroll-region sequences", () => {
  const writes: string[] = [];
  const writer = createAnsiWriter((chunk) => writes.push(chunk));

  writer.clearScreen();
  writer.setScrollRegion(1, 20);
  writer.resetScrollRegion();

  assert.deepEqual(writes, ["\u001b[2J", "\u001b[1;20r", "\u001b[r"]);
});

test("createAnsiWriter emits save and restore cursor sequences", () => {
  const writes: string[] = [];
  const writer = createAnsiWriter((chunk) => writes.push(chunk));

  writer.saveCursor();
  writer.restoreCursor();

  assert.deepEqual(writes, ["\u001b7", "\u001b8"]);
});

test("createAnsiWriter emits autowrap control sequences", () => {
  const writes: string[] = [];
  const writer = createAnsiWriter((chunk) => writes.push(chunk));

  writer.disableLineWrap();
  writer.enableLineWrap();

  assert.deepEqual(writes, ["\u001b[?7l", "\u001b[?7h"]);
});
