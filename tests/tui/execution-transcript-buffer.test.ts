import test from "node:test";
import assert from "node:assert/strict";

import {
  appendTranscriptChunk,
  createExecutionTranscriptBuffer,
} from "../../src/tui/execution-transcript-buffer.ts";

if (false) {
  const buffer = createExecutionTranscriptBuffer();
  // @ts-expect-error transcript buffer line collections are read-only at the public boundary
  buffer.headLines.push("mutate-head");
  // @ts-expect-error transcript buffer line collections are read-only at the public boundary
  buffer.tailLines.push("mutate-tail");
}

test("execution transcript buffer retains capped head and tail after a huge append", () => {
  const committedLines = Array.from(
    { length: 5000 },
    (_value, index) => `line-${index + 1}`,
  );
  const output = `${committedLines.join("\n")}\ntrailing-fragment`;

  const buffer = appendTranscriptChunk(createExecutionTranscriptBuffer(), output);

  assert.equal(buffer.headLines.length, 100);
  assert.equal(buffer.tailLines.length, 2000);
  assert.equal(buffer.omittedLineCount, 2900);
  assert.equal(buffer.pendingFragment, "trailing-fragment");
  assert.equal(buffer.headLines[0], "line-1");
  assert.equal(buffer.headLines[99], "line-100");
  assert.equal(buffer.tailLines[0], "line-3001");
  assert.equal(buffer.tailLines[1999], "line-5000");
});

test("execution transcript buffer preserves partial line until a newline arrives", () => {
  let buffer = createExecutionTranscriptBuffer({
    headLineLimit: 2,
    tailLineLimit: 3,
  });

  buffer = appendTranscriptChunk(buffer, "alpha\nbeta");
  assert.equal(buffer.pendingFragment, "beta");
  assert.deepEqual(buffer.headLines, ["alpha"]);
  assert.deepEqual(buffer.tailLines, ["alpha"]);
  assert.equal(buffer.omittedLineCount, 0);

  buffer = appendTranscriptChunk(buffer, " gamma\n");
  assert.equal(buffer.pendingFragment, "");
  assert.deepEqual(buffer.headLines, ["alpha", "beta gamma"]);
  assert.deepEqual(buffer.tailLines, ["alpha", "beta gamma"]);
  assert.equal(buffer.omittedLineCount, 0);
});

test("execution transcript buffer handles CRLF split across chunks without emitting a blank line", () => {
  let buffer = createExecutionTranscriptBuffer({
    headLineLimit: 10,
    tailLineLimit: 10,
  });

  buffer = appendTranscriptChunk(buffer, "foo\r");
  assert.deepEqual(buffer.headLines, []);
  assert.deepEqual(buffer.tailLines, []);
  assert.equal(buffer.pendingFragment, "foo\r");

  buffer = appendTranscriptChunk(buffer, "\nbar");
  assert.deepEqual(buffer.headLines, ["foo"]);
  assert.deepEqual(buffer.tailLines, ["foo"]);
  assert.equal(buffer.pendingFragment, "bar");
  assert.equal(buffer.omittedLineCount, 0);
});
