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
    saveCursor: () => {
      calls.push("cursor:save");
    },
    restoreCursor: () => {
      calls.push("cursor:restore");
    },
    disableLineWrap: () => {
      calls.push("wrap:disable");
    },
    enableLineWrap: () => {
      calls.push("wrap:enable");
    },
    moveCursor: () => {},
    clearLine: () => {},
    clearScreen: () => {
      calls.push("screen:clear");
    },
    setScrollRegion: (top: number, bottom: number) => {
      calls.push(`region:${top}-${bottom}`);
    },
    resetScrollRegion: () => {
      calls.push("region:reset");
    },
  };
}

test("createTerminalSession enter stays on the main screen and hides the cursor after raw mode", () => {
  const calls: string[] = [];
  const session = createTerminalSession({
    setRawMode: (enabled) => {
      calls.push(`raw:${enabled}`);
    },
    writer: createWriter(calls),
  });

  session.enter();

  assert.deepEqual(calls, ["raw:true", "cursor:hide"]);
});

test("createTerminalSession exit shows cursor, disables raw mode, and resets the scroll region", () => {
  const calls: string[] = [];
  const session = createTerminalSession({
    setRawMode: (enabled) => {
      calls.push(`raw:${enabled}`);
    },
    writer: createWriter(calls),
  });

  session.exit();

  assert.deepEqual(calls, ["cursor:show", "raw:false", "region:reset"]);
});

test("createTerminalSession enter does not attempt screen cleanup if enabling raw mode throws", () => {
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
  assert.deepEqual(calls, ["raw:true"]);
});

test("createTerminalSession enter disables raw mode if hiding cursor throws", () => {
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
  assert.deepEqual(calls, ["raw:true", "cursor:hide", "raw:false"]);
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
  assert.deepEqual(calls, ["cursor:show", "raw:false", "region:reset"]);
});
