import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { executeBuiltinCommand } from "../../src/commands/command-executor.ts";
import type { BootstrapContext } from "../../src/runtime/bootstrap-context.ts";

function createContext(
  sessionSummary = "ready",
  projectRoot = "/tmp/project",
): BootstrapContext {
  return {
    projectRoot,
    mode: "balanced",
    entry: {
      kind: "interactive",
    },
    instructions: [],
    memory: [],
    activeArtifacts: {
      required: [],
      optional: [],
      onDemand: [],
    },
    loadedArtifacts: {
      required: [],
      optional: [],
      onDemand: [],
    },
    degradedArtifactIds: [],
    sessionSummary,
  };
}

test("executeBuiltinCommand renders grouped help from visible registry sections", async () => {
  const result = await executeBuiltinCommand("/help", createContext());

  assert.equal(result.handled, true);
  assert.deepEqual(result.effects, [
    { type: "system_message", line: "Available commands" },
    { type: "system_message", line: "" },
    { type: "system_message", line: "Session" },
    {
      type: "system_message",
      line: "/help    Show the built-in session commands.",
    },
    {
      type: "system_message",
      line: "/status    Show the current session status.",
    },
    {
      type: "system_message",
      line: "/clear    Clear the current conversation history.",
    },
    {
      type: "system_message",
      line: "/theme    Open the local theme selector.",
    },
    {
      type: "system_message",
      line: "/exit    Exit the current interactive session.",
    },
    { type: "system_message", line: "" },
    { type: "system_message", line: "Project" },
    {
      type: "system_message",
      line: "/branch    Show the current git branch for the project root.",
    },
    {
      type: "system_message",
      line: "/init    Initialize the artifact workspace directory structure.",
    },
    { type: "system_message", line: "" },
    { type: "system_message", line: "Debug" },
    {
      type: "system_message",
      line: "/stack    Show the current instruction stack layers.",
    },
  ]);
  assert.ok(
    result.effects.every(
      (effect) => effect.type !== "system_message" || !effect.line.includes("/inspect"),
    ),
  );
});

test("executeBuiltinCommand returns a local error for unknown slash commands", async () => {
  const result = await executeBuiltinCommand("/wat", createContext());

  assert.equal(result.handled, true);
  assert.deepEqual(result.effects, [
    { type: "system_message", line: "Unknown command: /wat" },
    { type: "system_message", line: "Run /help to see available commands." },
  ]);
});

test("executeBuiltinCommand leaves non-command and bare slash input unhandled", async () => {
  const promptResult = await executeBuiltinCommand("hello", createContext());
  const bareSlashResult = await executeBuiltinCommand("/", createContext());

  assert.deepEqual(promptResult, {
    handled: false,
    effects: [],
  });
  assert.deepEqual(bareSlashResult, {
    handled: false,
    effects: [],
  });
});

test("executeBuiltinCommand returns an exit_session effect for /exit", async () => {
  const result = await executeBuiltinCommand("/exit", createContext());

  assert.equal(result.handled, true);
  assert.deepEqual(result.effects, [{ type: "exit_session" }]);
});

test("executeBuiltinCommand preserves /clear and /status behavior", async () => {
  const clearResult = await executeBuiltinCommand("/clear", createContext());
  const statusResult = await executeBuiltinCommand(
    "/status",
    createContext("ready\nall systems go"),
  );

  assert.equal(clearResult.handled, true);
  assert.deepEqual(clearResult.effects, [
    { type: "clear_conversation" },
    { type: "system_message", line: "conversation cleared" },
  ]);

  assert.equal(statusResult.handled, true);
  assert.deepEqual(statusResult.effects, [
    { type: "system_message", line: "ready" },
    { type: "system_message", line: "all systems go" },
  ]);
});

test("executeBuiltinCommand preserves /branch behavior through registry-based resolution", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "command-executor-"));
  const gitOptions = { cwd: projectRoot, stdio: "ignore" as const };

  try {
    execFileSync("git", ["-c", "init.defaultBranch=task-two-branch", "init"], gitOptions);
    execFileSync("git", ["config", "user.name", "Expecto Test"], gitOptions);
    execFileSync("git", ["config", "user.email", "expecto@example.com"], gitOptions);
    writeFileSync(join(projectRoot, "README.md"), "test\n");
    execFileSync("git", ["add", "README.md"], gitOptions);
    execFileSync("git", ["commit", "-m", "init"], gitOptions);

    const result = await executeBuiltinCommand("/branch", createContext("ready", projectRoot));

    assert.equal(result.handled, true);
    assert.deepEqual(result.effects, [
      { type: "system_message", line: "branch: task-two-branch" },
      {
        type: "execution_item",
        summary: "Read git branch",
        body: "$ git branch --show-current\ntask-two-branch\nresolved: task-two-branch",
      },
    ]);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("executeBuiltinCommand resolves detached main to the main label", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "command-executor-detached-"));
  const gitOptions = { cwd: projectRoot, stdio: "ignore" as const };

  try {
    execFileSync("git", ["-c", "init.defaultBranch=main", "init"], gitOptions);
    execFileSync("git", ["config", "user.name", "Expecto Test"], gitOptions);
    execFileSync("git", ["config", "user.email", "expecto@example.com"], gitOptions);
    writeFileSync(join(projectRoot, "README.md"), "test\n");
    execFileSync("git", ["add", "README.md"], gitOptions);
    execFileSync("git", ["commit", "-m", "init"], gitOptions);
    execFileSync("git", ["checkout", "--detach"], gitOptions);

    const result = await executeBuiltinCommand("/branch", createContext("ready", projectRoot));

    assert.equal(result.handled, true);
    assert.deepEqual(result.effects[0], { type: "system_message", line: "branch: main" });
    assert.equal(result.effects[1]?.type, "execution_item");
    assert.equal(result.effects[1]?.summary, "Read git branch");
    assert.match(result.effects[1]?.body ?? "", /\bmain\b/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("executeBuiltinCommand preserves hidden registry passthrough for /inspect", async () => {
  const result = await executeBuiltinCommand("/inspect call-123", createContext());

  assert.deepEqual(result, {
    handled: false,
    effects: [],
  });
});

test("executeBuiltinCommand returns an open theme picker effect for /theme", async () => {
  const result = await executeBuiltinCommand("/theme", createContext());

  assert.equal(result.handled, true);
  assert.deepEqual(result.effects, [
    {
      type: "open_theme_picker",
    },
  ]);
});

test("executeBuiltinCommand /write_artifact routes task input through ArtifactWriter", async () => {
  const { mkdtemp, mkdir } = await import("node:fs/promises");
  const { currentAppPath } = await import("../../src/core/brand.ts");

  const projectRoot = await mkdtemp(join(tmpdir(), "expecto-writecmd-"));
  await mkdir(join(projectRoot, currentAppPath("docs", "tasks", "active")), { recursive: true });
  await mkdir(join(projectRoot, currentAppPath("docs", "tasks", "backlog")), { recursive: true });
  await mkdir(join(projectRoot, currentAppPath("docs", "summaries")), { recursive: true });

  try {
    const payload = JSON.stringify({
      kind: "task",
      title: "smoke test",
      content: "# Smoke\n",
    });
    const result = await executeBuiltinCommand(
      `/write_artifact ${payload}`,
      createContext("ready", projectRoot),
    );

    assert.equal(result.handled, true);
    const messageLines = result.effects
      .filter((effect) => effect.type === "system_message")
      .map((effect) => (effect as { line: string }).line);

    assert.ok(
      messageLines.some((line) => /artifact written/i.test(line) && /T-001-smoke-test/.test(line)),
      `expected confirmation line, got ${messageLines.join(" | ")}`,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("executeBuiltinCommand /write_artifact reports invalid JSON", async () => {
  const result = await executeBuiltinCommand("/write_artifact not-json", createContext());

  assert.equal(result.handled, true);
  const messageLines = result.effects
    .filter((effect) => effect.type === "system_message")
    .map((effect) => (effect as { line: string }).line);

  assert.ok(
    messageLines.some((line) => /JSON/i.test(line)),
    `expected JSON error, got ${messageLines.join(" | ")}`,
  );
});

test("executeBuiltinCommand /write_artifact reports writer validation errors", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "expecto-writecmd-bad-"));

  try {
    const payload = JSON.stringify({
      kind: "summary",
      title: "x",
      content: "y",
      // Missing metadata.artifact_subtype on purpose
    });
    const result = await executeBuiltinCommand(
      `/write_artifact ${payload}`,
      createContext("ready", projectRoot),
    );

    assert.equal(result.handled, true);
    const messageLines = result.effects
      .filter((effect) => effect.type === "system_message")
      .map((effect) => (effect as { line: string }).line);

    assert.ok(
      messageLines.some((line) => /artifact_subtype/.test(line)),
      `expected writer validation error to surface, got ${messageLines.join(" | ")}`,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("/write_artifact is registered as hidden and not listed in /help output", async () => {
  const helpResult = await executeBuiltinCommand("/help", createContext());
  const helpText = helpResult.effects
    .filter((effect) => effect.type === "system_message")
    .map((effect) => (effect as { line: string }).line)
    .join("\n");

  assert.doesNotMatch(helpText, /\/write_artifact/);
});

test("executeBuiltinCommand /write_artifact preserves internal whitespace of JSON content", async () => {
  const { mkdtemp, mkdir, readFile } = await import("node:fs/promises");
  const { currentAppPath } = await import("../../src/core/brand.ts");

  const projectRoot = await mkdtemp(join(tmpdir(), "expecto-writecmd-ws-"));
  await mkdir(join(projectRoot, currentAppPath("docs", "tasks", "active")), { recursive: true });
  await mkdir(join(projectRoot, currentAppPath("docs", "tasks", "backlog")), { recursive: true });
  await mkdir(join(projectRoot, currentAppPath("docs", "summaries")), { recursive: true });

  try {
    // Content has a literal newline followed by two spaces and a dash — a typical
    // nested markdown list. parsed.args.join(" ") would collapse the two spaces to one.
    const body = "line1\n  - item\n    nested\n- item2";
    const payload = JSON.stringify({
      kind: "task",
      title: "whitespace probe",
      content: body,
    });
    const result = await executeBuiltinCommand(
      `/write_artifact ${payload}`,
      createContext("ready", projectRoot),
    );

    assert.equal(result.handled, true);
    const confirmation = result.effects.find(
      (effect): effect is { type: "system_message"; line: string } =>
        effect.type === "system_message" && /artifact written/.test((effect as { line: string }).line),
    );
    assert.ok(confirmation, "expected artifact written confirmation");

    // Extract file path from the confirmation line
    const pathMatch = confirmation.line.match(/\(([^)]+)\)$/);
    assert.ok(pathMatch, `could not extract path from: ${confirmation.line}`);
    const relativePath = pathMatch[1];
    assert.ok(relativePath, "expected capture group to be non-empty");

    const rawFile = await readFile(join(projectRoot, relativePath), "utf8");
    // Verify exact whitespace preserved by locating the nested-list portion verbatim
    assert.ok(
      rawFile.includes("line1\n  - item\n    nested\n- item2"),
      `expected whitespace preserved; got:\n${rawFile}`,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
