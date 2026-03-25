import assert from "node:assert/strict";
import test from "node:test";

import { createTerminalSession } from "../../../src/tui/renderer-terminal/terminal-session.ts";

function createWriter(calls: string[]) {
  return {
    hideCursor: () => {
      calls.push("cursor:hide");
    },
    showCursor: () => {
      calls.push("cursor:show");
    },
    moveCursor: () => {},
    clearLine: () => {},
    enterAlternateScreen: () => {
      calls.push("screen:enter");
    },
    exitAlternateScreen: () => {
      calls.push("screen:exit");
    },
  };
}

test("createTerminalSession enter orders alt-screen, raw-mode, and cursor hide", () => {
  const calls: string[] = [];
  const session = createTerminalSession({
    setRawMode: (enabled) => {
      calls.push(`raw:${enabled}`);
    },
    writer: createWriter(calls),
  });

  session.enter();

  assert.deepEqual(calls, ["screen:enter", "raw:true", "cursor:hide"]);
});

test("createTerminalSession exit orders cursor show, raw-mode disable, and alt-screen off", () => {
  const calls: string[] = [];
  const session = createTerminalSession({
    setRawMode: (enabled) => {
      calls.push(`raw:${enabled}`);
    },
    writer: createWriter(calls),
  });

  session.exit();

  assert.deepEqual(calls, ["cursor:show", "raw:false", "screen:exit"]);
});

test("createTerminalSession enter exits alternate screen if enabling raw mode throws", () => {
  const calls: string[] = [];
  const session = createTerminalSession({
    setRawMode: (enabled) => {
      calls.push(`raw:${enabled}`);
      if (enabled) {
        throw new Error("raw-on failed");
      }
    },
    writer: createWriter(calls),
  });

  assert.throws(() => session.enter(), /raw-on failed/);
  assert.deepEqual(calls, ["screen:enter", "raw:true", "screen:exit"]);
});

test("createTerminalSession enter disables raw mode and exits alternate screen if hiding cursor throws", () => {
  const calls: string[] = [];
  const writer = createWriter(calls);
  const session = createTerminalSession({
    setRawMode: (enabled) => {
      calls.push(`raw:${enabled}`);
    },
    writer: {
      ...writer,
      hideCursor: () => {
        calls.push("cursor:hide");
        throw new Error("hide failed");
      },
    },
  });

  assert.throws(() => session.enter(), /hide failed/);
  assert.deepEqual(calls, ["screen:enter", "raw:true", "cursor:hide", "raw:false", "screen:exit"]);
});

test("createTerminalSession exit attempts all cleanup steps even if one throws", () => {
  const calls: string[] = [];
  const writer = createWriter(calls);
  const session = createTerminalSession({
    setRawMode: (enabled) => {
      calls.push(`raw:${enabled}`);
      throw new Error("raw-off failed");
    },
    writer: {
      ...writer,
      showCursor: () => {
        calls.push("cursor:show");
        throw new Error("show failed");
      },
    },
  });

  assert.throws(() => session.exit(), /show failed/);
  assert.deepEqual(calls, ["cursor:show", "raw:false", "screen:exit"]);
});
