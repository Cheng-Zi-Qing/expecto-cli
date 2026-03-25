import test from "node:test";
import assert from "node:assert/strict";

import { parseCliArgs } from "../../src/cli/arg-parser.ts";

test("returns interactive mode when no args are provided", () => {
  const result = parseCliArgs([]);

  assert.deepEqual(result, {
    kind: "interactive",
  });
});

test("returns interactive mode with an initial prompt for a positional argument", () => {
  const result = parseCliArgs(["help me refactor auth"]);

  assert.deepEqual(result, {
    kind: "interactive",
    initialPrompt: "help me refactor auth",
  });
});

test("returns print mode for -p with a prompt", () => {
  const result = parseCliArgs(["-p", "summarize this repository"]);

  assert.deepEqual(result, {
    kind: "print",
    prompt: "summarize this repository",
  });
});

test("returns print mode for --print with a prompt", () => {
  const result = parseCliArgs(["--print", "summarize this repository"]);

  assert.deepEqual(result, {
    kind: "print",
    prompt: "summarize this repository",
  });
});

test("returns continue mode for --continue", () => {
  const result = parseCliArgs(["--continue"]);

  assert.deepEqual(result, {
    kind: "continue",
  });
});

test("returns resume mode for --resume with a session id", () => {
  const result = parseCliArgs(["--resume", "session-123"]);

  assert.deepEqual(result, {
    kind: "resume",
    session: "session-123",
  });
});

test("throws when -p is provided without a prompt", () => {
  assert.throws(() => parseCliArgs(["-p"]), /requires a prompt/);
});

test("throws when --resume is provided without a session id", () => {
  assert.throws(() => parseCliArgs(["--resume"]), /requires a session id/);
});

test("throws when multiple positional prompts are provided", () => {
  assert.throws(
    () => parseCliArgs(["first prompt", "second prompt"]),
    /single positional prompt/,
  );
});
