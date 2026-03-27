import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

import {
  assemblePromptFromPipeline,
  readAllStdin,
} from "../../src/cli/stdin-pipeline.ts";

test("combines an explicit prompt with stdin context", () => {
  const result = assemblePromptFromPipeline({
    prompt: "help me optimize this code",
    stdinText: "def run():\n    pass\n",
  });

  assert.equal(
    result,
    "[User Instruction]\nhelp me optimize this code\n\n[Additional Context]\ndef run():\n    pass\n",
  );
});

test("wraps stdin-only input in the stable analysis prompt", () => {
  const result = assemblePromptFromPipeline({
    prompt: undefined,
    stdinText: "Traceback: boom",
  });

  assert.equal(
    result,
    "Please analyze the following input and provide the most helpful direct summary, code review, or bug-fix guidance:\n\n[Input]\nTraceback: boom",
  );
});

test("preserves a plain prompt when no stdin payload exists", () => {
  const result = assemblePromptFromPipeline({
    prompt: "say hello",
    stdinText: "",
  });

  assert.equal(result, "say hello");
});

test("reads all stdin text from a supplied readable without touching process.stdin", async () => {
  const input = Readable.from(["line 1\n", "line 2\n"]);

  assert.equal(await readAllStdin(input), "line 1\nline 2\n");
});

test("reads buffer chunks without mangling text", async () => {
  const input = Readable.from([Buffer.from("alpha"), Buffer.from("beta")]);

  assert.equal(await readAllStdin(input), "alphabeta");
});

test("reads Uint8Array chunks without mangling text", async () => {
  const input = Readable.from([
    new Uint8Array(Buffer.from("gamma")),
    new Uint8Array(Buffer.from("delta")),
  ]);

  assert.equal(await readAllStdin(input), "gammadelta");
});

test("decodes multibyte utf-8 across chunk boundaries", async () => {
  const emoji = "🧠 Review";
  const emojiBytes = Buffer.from(emoji);
  const firstChunk = emojiBytes.slice(0, 2);
  const secondChunk = emojiBytes.slice(2);
  const input = Readable.from([firstChunk, secondChunk]);

  assert.equal(await readAllStdin(input), emoji);
});
