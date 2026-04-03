import assert from "node:assert";
import { test } from "node:test";

import { parseCliArgs } from "../../src/cli/arg-parser.ts";
import { resolveCliRoute } from "../../src/cli/route-resolution.ts";

const baseInput = () => ({
  parsed: parseCliArgs([]),
  stdinIsTTY: true,
  stdoutIsTTY: true,
  hasStdinPayload: false,
  deprecatedTerminalRendererEnv: false,
});

test("bare invocation on a full TTY resolves to fullscreen TUI", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs([]),
  });

  assert.equal(result.kind, "tui");
  if (result.kind !== "tui") {
    throw new Error("expected tui route");
  }
  assert.deepEqual(result.bootstrapCommand, {
    kind: "interactive",
  });
  assert.deepEqual(result.warnings, []);
});

test("positional prompt resolves to single-shot stream output", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs(["fix auth regression"]),
  });

  assert.equal(result.kind, "stream_single");
  if (result.kind !== "stream_single") {
    throw new Error("expected stream_single route");
  }
  assert.deepEqual(result.bootstrapCommand, {
    kind: "print",
    prompt: "fix auth regression",
  });
});

test("stdin payload with no prompt resolves to single-shot stream output", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs([]),
    stdinIsTTY: false,
    hasStdinPayload: true,
  });

  assert.equal(result.kind, "stream_single");
});

test("stdout redirection plus no prompt fail-fast when there is no visible interactive path", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs([]),
    stdinIsTTY: true,
    stdoutIsTTY: false,
    hasStdinPayload: false,
  });

  assert.equal(result.kind, "error");
  if (result.kind !== "error") {
    throw new Error("expected error route");
  }
  assert.match(result.message, /non-tty environment/i);
});

test("fail-fast also triggers when stdin payload exists but stdout redirected", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs([]),
    stdinIsTTY: true,
    stdoutIsTTY: false,
    hasStdinPayload: true,
  });

  assert.equal(result.kind, "error");
  if (result.kind !== "error") {
    throw new Error("expected error route");
  }
});

test("legacy --continue preserves route under redirected output", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs(["--continue"]),
    stdinIsTTY: true,
    stdoutIsTTY: false,
    hasStdinPayload: true,
  });

  assert.equal(result.kind, "continue");
});

test("legacy --resume preserves route under redirected output", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs(["--resume"]),
    stdinIsTTY: true,
    stdoutIsTTY: false,
    hasStdinPayload: true,
  });

  assert.equal(result.kind, "resume");
  if (result.kind !== "resume") {
    throw new Error("expected resume route");
  }
  assert.deepEqual(result.bootstrapCommand, {
    kind: "resume",
  });
});

test("explicit --native without prompt on TTY enters native_repl route", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs(["--native"]),
  });

  assert.equal(result.kind, "native_repl");
  if (result.kind !== "native_repl") {
    throw new Error("expected native_repl route");
  }
  assert.deepEqual(result.bootstrapCommand, {
    kind: "interactive",
  });
});

test("explicit --native with prompt prefers stream_single print route", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs(["--native", "fix auth regression"]),
  });

  assert.equal(result.kind, "stream_single");
  if (result.kind !== "stream_single") {
    throw new Error("expected stream_single route");
  }
  assert.deepEqual(result.bootstrapCommand, {
    kind: "print",
    prompt: "fix auth regression",
  });
});

test("explicit --tui with prompt on full TTY stays in tui", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs(["--tui", "ask something"]),
  });

  assert.equal(result.kind, "tui");
  if (result.kind !== "tui") {
    throw new Error("expected tui route");
  }
  assert.deepEqual(result.bootstrapCommand, {
    kind: "interactive",
    initialPrompt: "ask something",
  });
});

test("non-TTY overrides explicit --tui to stream_single to satisfy guard", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs(["--tui", "ask something"]),
    stdinIsTTY: true,
    stdoutIsTTY: false,
  });

  assert.equal(result.kind, "stream_single");
  if (result.kind !== "stream_single") {
    throw new Error("expected stream_single route");
  }
  assert.deepEqual(result.bootstrapCommand, {
    kind: "print",
    prompt: "ask something",
  });
});

test("deprecated print alias returns a warning instead of remaining a first-class route", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs(["-p", "say hello"]),
  });

  assert.equal(result.kind, "stream_single");
  if (result.kind !== "stream_single") {
    throw new Error("expected stream_single route");
  }
  assert.deepEqual(result.bootstrapCommand, {
    kind: "print",
    prompt: "say hello",
  });
  assert.ok(
    result.warnings.some((warning) => warning.code === "DEPRECATED_PRINT_ALIAS"),
  );
});

test("removed deprecated terminal renderer env no longer adds route warnings", () => {
  const result = resolveCliRoute({
    ...baseInput(),
    parsed: parseCliArgs([]),
    deprecatedTerminalRendererEnv: true,
  });

  assert.equal(result.kind, "tui");
  assert.deepEqual(result.warnings, []);
});
