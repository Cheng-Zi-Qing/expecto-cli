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

function makeHandlers(overrides: Partial<{
  onDraftChange: (draft: string) => void;
  onSubmit: (draft: string) => void;
}> = {}) {
  return {
    onDraftChange: overrides.onDraftChange ?? (() => {}),
    onSubmit: overrides.onSubmit ?? (() => {}),
    onInterrupt() {},
    onExit() {},
    onMoveSelectionUp() {},
    onMoveSelectionDown() {},
    onToggleSelectedItem() {},
  };
}

test("handleTerminalInputChunk treats \\r as newline inside bracketed paste", () => {
  const drafts: string[] = [];
  const submits: string[] = [];

  handleTerminalInputChunk(
    "\u001b[200~line1\rline2\u001b[201~",
    { draft: "", inputLocked: false },
    makeHandlers({
      onDraftChange: (d) => { drafts.push(d); },
      onSubmit: (d) => { submits.push(d); },
    }),
  );

  assert.equal(submits.length, 0);
  assert.equal(drafts.at(-1), "line1\nline2");
});

test("handleTerminalInputChunk submits on \\r outside bracketed paste", () => {
  const submits: string[] = [];

  handleTerminalInputChunk(
    "hello\r",
    { draft: "", inputLocked: false },
    makeHandlers({ onSubmit: (d) => { submits.push(d); } }),
  );

  assert.deepEqual(submits, ["hello"]);
});

test("handleTerminalInputChunk handles multi-line paste with \\r\\n line endings", () => {
  const drafts: string[] = [];
  const submits: string[] = [];

  handleTerminalInputChunk(
    "\u001b[200~first\r\nsecond\r\nthird\u001b[201~",
    { draft: "", inputLocked: false },
    makeHandlers({
      onDraftChange: (d) => { drafts.push(d); },
      onSubmit: (d) => { submits.push(d); },
    }),
  );

  assert.equal(submits.length, 0);
  assert.equal(drafts.at(-1), "first\nsecond\nthird");
});

test("handleTerminalInputChunk converts large paste to attachment", () => {
  const drafts: string[] = [];
  const attachments: string[] = [];

  handleTerminalInputChunk(
    "\u001b[200~line1\nline2\nline3\u001b[201~",
    { draft: "", inputLocked: false },
    {
      ...makeHandlers({ onDraftChange: (d) => { drafts.push(d); } }),
      onAddAttachment: (content) => { attachments.push(content); },
    },
  );

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0], "line1\nline2\nline3");
  // draft should not contain the raw pasted text
  assert.equal(drafts.filter((d) => d.includes("line1")).length, 0);
});

test("handleTerminalInputChunk does not convert small paste to attachment", () => {
  const drafts: string[] = [];
  const attachments: string[] = [];

  handleTerminalInputChunk(
    "\u001b[200~hello\u001b[201~",
    { draft: "", inputLocked: false },
    {
      ...makeHandlers({ onDraftChange: (d) => { drafts.push(d); } }),
      onAddAttachment: (content) => { attachments.push(content); },
    },
  );

  assert.equal(attachments.length, 0);
  assert.equal(drafts.at(-1), "hello");
});

test("handleTerminalInputChunk converts large paste split across multiple chunks", async () => {
  const { createPasteState } = await import("../../../src/tui/renderer-terminal/input-driver.ts");
  const attachments: string[] = [];
  const pasteState = createPasteState();
  const handlers = {
    ...makeHandlers(),
    onAddAttachment: (content: string) => { attachments.push(content); },
  };

  // Simulate terminal splitting a large paste into 3 chunks
  handleTerminalInputChunk("\u001b[200~line1\nline2\n", { draft: "", inputLocked: false, pasteState }, handlers);
  handleTerminalInputChunk("line3\nline4\n", { draft: "", inputLocked: false, pasteState }, handlers);
  handleTerminalInputChunk("line5\u001b[201~", { draft: "", inputLocked: false, pasteState }, handlers);

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0], "line1\nline2\nline3\nline4\nline5");
});

test("handleTerminalInputChunk backspace removes entire attachment placeholder", async () => {
  const { attachmentPlaceholder } = await import("../../../src/tui/tui-state.ts");
  const id = "test-1";
  const placeholder = attachmentPlaceholder(id);
  const attachment = { id, content: "a\nb\nc", lineCount: 3, tokenCount: 1 };
  const drafts: string[] = [];

  handleTerminalInputChunk(
    "\u007f",
    { draft: placeholder, inputLocked: false, draftAttachments: [attachment] },
    makeHandlers({ onDraftChange: (d) => { drafts.push(d); } }),
  );

  assert.equal(drafts.at(-1), "");
});
