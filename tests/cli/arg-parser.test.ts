import test from "node:test";
import assert from "node:assert/strict";

import { parseCliArgs } from "../../src/cli/arg-parser.ts";

test("returns empty parsed args when no args are provided", () => {
  const result = parseCliArgs([]);

  assert.deepEqual(result, {});
});

test("parses a positional prompt without treating it as fullscreen intent", () => {
  const result = parseCliArgs(["fix auth regression"]);

  assert.deepEqual(result, {
    prompt: "fix auth regression",
  });
});

test("distinguishes an explicit empty prompt from a bare invocation", () => {
  assert.deepEqual(parseCliArgs([""]), {
    prompt: "",
  });
});

test("parses --native and --tui as explicit mode selectors", () => {
  assert.deepEqual(parseCliArgs(["--native"]), {
    explicitMode: "native",
  });

  assert.deepEqual(parseCliArgs(["--tui", "fix auth regression"]), {
    explicitMode: "tui",
    prompt: "fix auth regression",
  });
});

test("marks -p and --print as deprecated prompt aliases", () => {
  const result = parseCliArgs(["-p", "summarize this repository"]);

  assert.deepEqual(result, {
    prompt: "summarize this repository",
    deprecatedPrintAlias: true,
  });

  assert.deepEqual(parseCliArgs(["--print", "summarize this repository"]), {
    prompt: "summarize this repository",
    deprecatedPrintAlias: true,
  });
});

test("returns continue mode for --continue", () => {
  const result = parseCliArgs(["--continue"]);

  assert.deepEqual(result, {
    kind: "continue",
  });
});

test("returns resume mode for --resume", () => {
  const result = parseCliArgs(["--resume"]);

  assert.deepEqual(result, {
    kind: "resume",
  });
});

test("throws when -p is provided without a prompt", () => {
  assert.throws(() => parseCliArgs(["-p"]), /requires a prompt/);
});

test("throws when --resume is provided with extra arguments", () => {
  assert.throws(() => parseCliArgs(["--resume", "session-123"]), /does not accept extra arguments/);
});

test("throws when multiple positional prompts are provided", () => {
  assert.throws(
    () => parseCliArgs(["first prompt", "second prompt"]),
    /single positional prompt/,
  );
});

test("rejects conflicting explicit mode flags", () => {
  assert.throws(
    () => parseCliArgs(["--native", "--tui"]),
    /cannot combine --native and --tui/,
  );
});

test("rejects reserved legacy flags when they appear after other args", () => {
  assert.throws(
    () => parseCliArgs(["--native", "--continue"]),
    /can only be used as the first argument/,
  );
  assert.throws(
    () => parseCliArgs(["fix auth regression", "--print"]),
    /can only be used as the first argument/,
  );
});
