import assert from "node:assert/strict";
import test from "node:test";

import { renderFooter } from "../../../src/tui/renderer-terminal/footer-renderer.ts";
import { wrapPlainText } from "../../../src/tui/renderer-terminal/text-layout.ts";
import {
  createScreenWriter,
  type ActiveStatusSnapshot,
  type ComposerSnapshot,
} from "../../../src/tui/sticky-screen/screen-writer.ts";

type FakeTimerId = number;

function createWriterCalls() {
  const calls: string[] = [];

  return {
    calls,
    writer: {
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
      moveCursor: (column: number, row: number) => {
        calls.push(`cursor:move:${row},${column}`);
      },
      clearLine: () => {
        calls.push("line:clear");
      },
      clearScreen: () => {
        calls.push("screen:clear");
      },
      setScrollRegion: (top: number, bottom: number) => {
        calls.push(`region:set:${top}-${bottom}`);
      },
      resetScrollRegion: () => {
        calls.push("region:reset");
      },
      disableLineWrap: () => {
        calls.push("wrap:disable");
      },
      enableLineWrap: () => {
        calls.push("wrap:enable");
      },
      enableBracketedPaste: () => {},
      disableBracketedPaste: () => {},
    },
  };
}

const composerSnapshot: ComposerSnapshot = {
  text: "draft",
  cursorOffset: 5,
  locked: false,
  hidden: false,
  placeholder: "Type a prompt",
  statusLabel: "Done",
};

const activeStatus: ActiveStatusSnapshot = {
  kind: "thinking",
  text: "Thinking...",
};

function resolveComposerCursor(
  snapshot: ComposerSnapshot,
  composerContentWidth: number,
  composerBodyHeight: number,
): { rowOffset: number; column: number } {
  const wrappedPrefix = wrapPlainText(snapshot.text, composerContentWidth).slice(-composerBodyHeight);
  const lastLine = wrappedPrefix.at(-1) ?? "";

  return {
    rowOffset: Math.max(0, wrappedPrefix.length - 1),
    column: lastLine.length + 1,
  };
}

test("screen writer enters sticky mode with initial padding before DECSTBM", () => {
  const { calls, writer } = createWriterCalls();
  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 20, cols: 80 }),
    reservedHeight: 4,
  });

  screenWriter.enterStickyMode();

  assert.deepEqual(calls.slice(0, 4), [
    "region:reset",
    `write:${JSON.stringify("\n\n\n\n")}`,
    "region:set:1-16",
    "cursor:hide",
  ]);
});

test("screen writer redraws sticky footer using framed composer and status lines", () => {
  const { calls, writer } = createWriterCalls();
  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 20, cols: 80 }),
    reservedHeight: 4,
  });

  screenWriter.enterStickyMode();
  screenWriter.setActiveStatus(activeStatus);
  calls.length = 0;

  const footer = renderFooter(
    {
      composer: {
        value: composerSnapshot.text,
        locked: composerSnapshot.locked,
      },
      status: {
        runtimeLabel: activeStatus.text,
      },
    },
    { width: 80, composerHeight: 2 },
  );
  screenWriter.renderComposer(composerSnapshot);

  const footerTopRow = 20 - 4 + 1;
  const cursor = resolveComposerCursor(
    composerSnapshot,
    footer.composerContentWidth,
    footer.composerBodyHeight,
  );
  const writePayloads = calls
    .filter((entry) => entry.startsWith("write:"))
    .map((entry) => JSON.parse(entry.slice("write:".length)));
  assert.deepEqual(writePayloads, footer.lines);
  assert.ok(
    !writePayloads.includes("Thinking..."),
    "expected no plain status row writes once framed footer redraw is active",
  );
  assert.ok(
    calls.includes(
      `cursor:move:${footerTopRow + footer.composerBodyTop + cursor.rowOffset},${footer.composerContentColumn + cursor.column - 1}`,
    ),
    "expected composer cursor placement to follow footer render metadata",
  );
  assert.equal(calls.filter((entry) => entry === "cursor:save").length, 1);
  assert.equal(calls.filter((entry) => entry === "cursor:restore").length, 1);
  assert.ok(
    calls.includes("wrap:disable"),
    "expected sticky footer redraw to disable terminal autowrap",
  );
  assert.ok(
    calls.includes("wrap:enable"),
    "expected sticky footer redraw to restore terminal autowrap",
  );
});

test("screen writer places the composer cursor using terminal cell width for full-width text", () => {
  const { calls, writer } = createWriterCalls();
  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 20, cols: 12 }),
    reservedHeight: 4,
  });

  screenWriter.enterStickyMode();
  calls.length = 0;

  screenWriter.renderComposer({
    text: "你好",
    cursorOffset: 2,
    locked: false,
    hidden: false,
    placeholder: "Type a prompt",
    statusLabel: "Done",
  });

  assert.ok(
    calls.includes("cursor:move:18,7"),
    "expected the cursor to advance by 4 terminal cells after two full-width characters",
  );
});

test("screen writer clears the reserved footer rows when the composer is hidden", () => {
  const { calls, writer } = createWriterCalls();
  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 20, cols: 80 }),
    reservedHeight: 4,
  });

  screenWriter.enterStickyMode();
  calls.length = 0;

  screenWriter.renderComposer({
    ...composerSnapshot,
    hidden: true,
    locked: true,
  });

  assert.equal(
    calls.filter((entry) => entry.startsWith("write:")).length,
    0,
    "expected hidden footer redraws to clear rows without drawing composer chrome",
  );
  assert.equal(
    calls.filter((entry) => entry === "line:clear").length,
    4,
    "expected every reserved footer row to be cleared",
  );
  assert.ok(
    calls.includes("cursor:hide"),
    "expected the cursor to stay hidden while the footer is suppressed",
  );
});

test("screen writer no-ops footer redraws in degraded mode while preserving timeline output", () => {
  const { calls, writer } = createWriterCalls();
  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 5, cols: 80 }),
    reservedHeight: 4,
  });

  screenWriter.enterStickyMode();
  calls.length = 0;

  screenWriter.setActiveStatus(activeStatus);
  screenWriter.renderComposer(composerSnapshot);
  screenWriter.writeTimelineChunk("alpha");

  assert.deepEqual(calls, [`write:${JSON.stringify("alpha")}`]);
});

test("screen writer writes timeline chunks through the scroll region while preserving the composer cursor", () => {
  const { calls, writer } = createWriterCalls();
  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 20, cols: 80 }),
    reservedHeight: 4,
  });

  screenWriter.enterStickyMode();
  screenWriter.renderComposer(composerSnapshot);
  calls.length = 0;

  screenWriter.writeTimelineChunk("alpha\nbeta\n");

  assert.deepEqual(calls, [
    "cursor:save",
    "cursor:move:16,1",
    "wrap:disable",
    `write:${JSON.stringify("alpha\nbeta\n")}`,
    "wrap:enable",
    "cursor:restore",
  ]);
});

test("screen writer replaces a fixed timeline surface without newline-driven scrolling", () => {
  const { calls, writer } = createWriterCalls();
  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 20, cols: 80 }),
    reservedHeight: 4,
  });

  screenWriter.enterStickyMode();
  calls.length = 0;

  screenWriter.replaceFixedTimeline(["alpha", "beta"]);

  const writePayloads = calls
    .filter((entry) => entry.startsWith("write:"))
    .map((entry) => JSON.parse(entry.slice("write:".length)));

  assert.deepEqual(writePayloads, ["alpha", "beta"]);
  assert.ok(
    !writePayloads.some((entry) => typeof entry === "string" && entry.includes("\n")),
    "expected fixed-surface repaints to avoid newline-driven terminal scrolling",
  );
  assert.ok(
    calls.includes("cursor:move:1,1") && calls.includes("cursor:move:2,1"),
    "expected fixed-surface repaint to address rows explicitly",
  );
});

test("screen writer only redraws changed rows for a fixed timeline surface", () => {
  const { calls, writer } = createWriterCalls();
  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 20, cols: 80 }),
    reservedHeight: 4,
  });

  screenWriter.enterStickyMode();
  screenWriter.replaceFixedTimeline(["top", "alpha", "omega"]);
  calls.length = 0;

  screenWriter.replaceFixedTimeline(
    ["top", "beta", "omega"],
    ["top", "alpha", "omega"],
  );

  const writePayloads = calls
    .filter((entry) => entry.startsWith("write:"))
    .map((entry) => JSON.parse(entry.slice("write:".length)));

  assert.deepEqual(writePayloads, ["beta"]);
  assert.ok(
    !calls.includes("cursor:move:1,1"),
    "expected unchanged top rows to be left alone during fixed-surface repaints",
  );
  assert.ok(
    calls.includes("cursor:move:2,1"),
    "expected the changed row to be addressed directly",
  );
});

test("screen writer suspends the scroll region while redrawing a fixed timeline surface", () => {
  const { calls, writer } = createWriterCalls();
  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 20, cols: 80 }),
    reservedHeight: 4,
  });

  screenWriter.enterStickyMode();
  calls.length = 0;

  screenWriter.replaceFixedTimeline(["alpha"]);

  const resetIndex = calls.indexOf("region:reset");
  const restoreIndex = calls.indexOf("region:set:1-16");

  assert.ok(resetIndex !== -1, "expected fixed-surface redraw to suspend DECSTBM first");
  assert.ok(restoreIndex !== -1, "expected fixed-surface redraw to restore DECSTBM after repaint");
  assert.ok(resetIndex < restoreIndex, "expected scroll-region suspension before restoration");
});

test("screen writer resets the scroll region before pager handoff and re-enters sticky mode on resume", () => {
  const { calls, writer } = createWriterCalls();
  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 20, cols: 80 }),
    reservedHeight: 4,
  });

  screenWriter.enterStickyMode();
  calls.length = 0;

  screenWriter.suspendForPager();
  screenWriter.resumeFromPager();

  assert.deepEqual(calls.slice(0, 2), ["region:reset", "cursor:show"]);
  assert.ok(
    calls.includes("region:set:1-16"),
    "expected sticky mode to be re-established after pager return",
  );
});

test("screen writer clears the sticky footer area and restores the cursor to a clean prompt row on exit", () => {
  const { calls, writer } = createWriterCalls();
  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 20, cols: 80 }),
    reservedHeight: 4,
  });

  screenWriter.enterStickyMode();
  screenWriter.renderComposer(composerSnapshot);
  calls.length = 0;

  screenWriter.exitStickyMode();

  assert.deepEqual(calls, [
    "cursor:move:17,1",
    "line:clear",
    "cursor:move:18,1",
    "line:clear",
    "cursor:move:19,1",
    "line:clear",
    "cursor:move:20,1",
    "line:clear",
    "cursor:move:17,1",
    "region:reset",
    "cursor:show",
  ]);
});

test("screen writer debounces resize rebuilds", () => {
  const { calls, writer } = createWriterCalls();
  let nextTimerId = 1;
  const timers = new Map<FakeTimerId, () => void>();
  let resizeSettled = 0;

  const screenWriter = createScreenWriter({
    writer,
    write: (chunk) => {
      calls.push(`write:${JSON.stringify(chunk)}`);
    },
    getTerminalSize: () => ({ rows: 20, cols: 80 }),
    reservedHeight: 4,
    resizeDebounceMs: 75,
    onResizeSettled: () => {
      resizeSettled += 1;
    },
    setTimer: (callback) => {
      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, callback);
      return timerId;
    },
    clearTimer: (timerId) => {
      timers.delete(timerId as FakeTimerId);
    },
  });

  screenWriter.scheduleResize();
  screenWriter.scheduleResize();

  assert.equal(timers.size, 1);

  const [timerCallback] = timers.values();
  assert.ok(timerCallback, "expected a debounced resize callback");
  timerCallback();

  assert.equal(resizeSettled, 1);
});
